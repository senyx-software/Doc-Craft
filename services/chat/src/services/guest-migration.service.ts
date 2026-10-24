import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { verifyUserToken } from '../../../../shared/user-auth.mjs';
import { db } from './db.service.js';
import { ConversationError } from './conversation.repository.js';

export async function migrateGuestDrafts(userId: string, guestToken: string, client = db) {
  if (!userId || userId.startsWith('guest_')) throw new ConversationError(403, 'An account is required');
  let claims;
  try { claims = await verifyUserToken(guestToken); }
  catch { throw new ConversationError(401, 'Invalid guest credential'); }
  const guestId = claims.sub;
  if (typeof guestId !== 'string' || !guestId.startsWith('guest_') || claims.plan !== 'guest') throw new ConversationError(403, 'A guest credential is required');
  const verified = await serviceFetch('auth', `${process.env.AUTH_SERVICE_URL || 'http://localhost:3011'}/internal/verify-token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({userId:guestId,token:guestToken}),
  });
  if (!verified.ok) throw new ConversationError(verified.status >= 500 ? 503 : 401, 'Guest verification unavailable');
  const account = await verified.json() as {valid?:boolean;user?:{id?:string;plan?:string}};
  if (!account.valid || account.user?.id !== guestId || account.user?.plan !== 'guest') throw new ConversationError(403, 'Guest credential is unavailable');
  return client.$transaction(async (tx: any) => {
    const draftsBeforeTransfer = await tx.chatSession.findMany({where:{userId:guestId,expiresAt:{gt:new Date()}},orderBy:{updatedAt:'desc'},select:{id:true},take:100});
    const claim = await tx.guestMigration.upsert({where:{guestId},create:{guestId,userId,sessionIds:draftsBeforeTransfer.map((row: any)=>row.id)},update:{}});
    if (claim.userId !== userId) throw new ConversationError(409, 'Guest drafts have already been claimed');
    const drafts = await tx.chatSession.updateMany({where:{userId:guestId,expiresAt:{gt:new Date()}},data:{userId,expiresAt:null}});
    return {migrated:drafts.count,sessionIds:claim.sessionIds};
  });
}
