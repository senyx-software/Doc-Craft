import { authenticator } from 'otplib';
import { openSecret } from '../../../../shared/sealed-secret.mjs';
import { prisma } from '../db/prisma.js';

/** Atomic high-water step, bound to the observed secret; shared across flows/replicas. */
export async function claimTotp(userId:string,stored:string,token:string,field:'totpSecret'|'pendingTotpSecret'='totpSecret') {
  if(!/^\d{6}$/.test(token))return false;
  const secret=openSecret(stored,userId);
  const delta=authenticator.checkDelta(token,secret);
  if(delta===null || delta===undefined)return false;
  const step=BigInt(Math.floor(Date.now()/30000)+delta);
  const result=await prisma.user.updateMany({where:{id:userId,[field]:stored,lastTotpStep:{lt:step}},data:{lastTotpStep:step}});
  return result.count===1;
}
