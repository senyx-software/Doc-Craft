import {prisma} from '../db/prisma.js';

/** Increment and lock in one database statement; concurrent failures cannot clear a lock. */
export async function recordFailedAuthentication(userId:string) {
 await prisma.$executeRaw`UPDATE users SET "failedLoginAttempts"="failedLoginAttempts"+1,
 "lockedUntil"=CASE WHEN "failedLoginAttempts"+1>=5 THEN GREATEST(COALESCE("lockedUntil",CURRENT_TIMESTAMP),CURRENT_TIMESTAMP+INTERVAL '15 minutes') ELSE "lockedUntil" END,
 "updatedAt"=CURRENT_TIMESTAMP WHERE id=${userId}`;
}
export async function recordSuccessfulAuthentication(userId:string) {
 const result=await prisma.user.updateMany({where:{id:userId,status:'active',deletedAt:null,OR:[{lockedUntil:null},{lockedUntil:{lte:new Date()}}]},data:{failedLoginAttempts:0,lockedUntil:null,lastLoginAt:new Date()}});
 if(result.count!==1)throw Object.assign(new Error('Account unavailable'),{statusCode:403});
}
