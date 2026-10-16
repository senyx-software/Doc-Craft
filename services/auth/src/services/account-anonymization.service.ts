import {createHash} from 'node:crypto';
import {prisma} from '../db/prisma.js';

/** Auth owns identity/session deletion. The operation is safe to retry. */
export async function anonymizeAccount(userId:string) {
 return prisma.$transaction(async tx=>{
  const account=await tx.user.findUnique({where:{id:userId},select:{id:true,email:true,status:true}});
  if(!account)throw Object.assign(new Error('Account not found'),{statusCode:404});
  const email=account.status==='deleted'?account.email:`deleted-${createHash('sha256').update(userId).digest('hex').slice(0,32)}@purged.doccraft.local`;
  await tx.user.update({where:{id:userId},data:{email,fullName:null,avatarUrl:null,passwordHash:null,totpSecret:null,pendingTotpSecret:null,backupCodes:null,refreshTokenHash:null,verificationToken:null,verificationTokenExpiresAt:null,status:'deleted',...(account.status==='deleted'?{}:{deletedAt:new Date()})}});
  await tx.session.deleteMany({where:{userId}});
  await tx.passwordReset.deleteMany({where:{userId}});
  return {user_id:userId,anonymized_email:email};
 });
}
