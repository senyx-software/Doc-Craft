import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { getRedis } from '../db/redis.js';
import { getEntitlements } from '../../../../shared/entitlements.mjs';
import { nextMidnightUTC, secondsUntilMidnightUTC } from '../lib/time.js';

/** PostgreSQL commits before permission is returned. Redis is a rebuildable cache. */
export async function ledgerOperation(userId:string, action:'reserve'|'refund'|'status'|'reset', reservationId?:string) {
  const policy = action==='refund' || action==='reset' ? null : await getEntitlements(userId);
  const id=createHash('sha256').update(JSON.stringify([userId,reservationId || randomUUID()])).digest('hex');
  const result=await prisma.$transaction(async tx=>{
    // One lock across days also serializes refunds spanning midnight and staff resets.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 4804))`;
    const [{now}]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`;
    let window=await tx.quotaWindow.findUnique({where:{userId}});
    if(window && window.endsAt<=now)window=null;
    let used=window?.used||0, allowed=false;
    const limit=policy?.daily_quota ?? 0;
    const hours=policy?.quota_policy.window_hours || 20;
    if(action==='reserve') {
      const receipt=await tx.quotaReservation.findUnique({where:{id}});
      if(receipt) allowed=policy!.account_enabled && !receipt.refundedAt;
      else if(policy!.account_enabled && (limit===-1 || used<limit)) {
        if(!window)window=await tx.quotaWindow.upsert({where:{userId},create:{userId,windowId:randomUUID(),startsAt:now,endsAt:new Date(now.getTime()+hours*3600000),used:0},update:{windowId:randomUUID(),startsAt:now,endsAt:new Date(now.getTime()+hours*3600000),used:0}});
        await tx.quotaReservation.create({data:{id,userId,reservationId:reservationId||id,day:window.windowId}});
        used++; allowed=true;
      }
    } else if(action==='refund') {
      const receipt=await tx.quotaReservation.findUnique({where:{id}});
      if(receipt && !receipt.refundedAt) {
        await tx.quotaReservation.update({where:{id},data:{refundedAt:now}});
        if(window && receipt.day===window.windowId) used=Math.max(0,used-1);
      }
    } else if(action==='reset') {
      if(window)await tx.quotaReservation.updateMany({where:{userId,day:window.windowId,refundedAt:null},data:{refundedAt:now}});
      used=0;
    }
    const end=window?.endsAt || new Date(now.getTime()+hours*3600000);
    if(window && action!=='status')await tx.quotaWindow.update({where:{userId},data:{used}});
    if(action!=='status') await tx.quota.upsert({where:{userId},create:{userId,used,limit,resetsAt:end},update:{used,...(policy?{limit}:{}),resetsAt:end}});
    return {userId,plan:policy?.plan||'free',used,limit,remaining:limit===-1?-1:Math.max(0,limit-used),resets_at:end.toISOString(),window_started:!!window,allowed,entitlements:policy};
  },{timeout:10000});
  // Cache failures cannot undo a durable reservation or refund. A fresh read
  // always reconstructs from PostgreSQL, including after a complete Redis loss.
  try {await getRedis().set(`quota:user:${userId}`,String(result.used),'EX',Math.max(1,Math.ceil((new Date(result.resets_at).getTime()-Date.now())/1000)));} catch { /* recovered on the next operation */ }
  return result;
}
