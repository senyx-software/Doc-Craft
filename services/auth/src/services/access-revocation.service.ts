import {prisma} from '../db/prisma.js';
import {Redis} from 'ioredis';
import {getExpiresInSeconds} from './jwt.service.js';
import {verifyUserToken} from '../../../../shared/user-auth.mjs';
let connection:Redis|undefined;
function store(){
 if(!process.env.REDIS_URL)throw new Error('Access revocation storage is not configured');
 if(!connection){connection=new Redis(process.env.REDIS_URL,{lazyConnect:true,connectTimeout:2000,commandTimeout:2000,maxRetriesPerRequest:1});connection.on('error',()=>{});}
 return connection;
}
export async function accessIsRevoked(token:string):Promise<boolean>{
 const claims=await verifyUserToken(token);
 const records=await prisma.accessRevocation.findMany({where:{key:{in:['jti:'+claims.jti,'user:'+claims.sub]},expiresAt:{gt:new Date()}}});
 return records.some((record: any)=>record.key.startsWith('jti:') || record.revokedAt.getTime()>=Number(claims.iat)*1000);
}
export async function revokeAccess(token:string){
 const claims=await verifyUserToken(token),seconds=Math.max(1,Number(claims.exp)-Math.floor(Date.now()/1000));
 await prisma.accessRevocation.upsert({where:{key:'jti:'+claims.jti},create:{key:'jti:'+claims.jti,expiresAt:new Date(Number(claims.exp)*1000)},update:{expiresAt:new Date(Number(claims.exp)*1000)}});
 try {await store().set('auth:revoked:'+claims.jti,'1','EX',seconds);} catch { /* DB remains authoritative */ }
}
export async function revokeAllAccess(userId:string,database:Pick<typeof prisma,'accessRevocation'>=prisma){
 const revokedAt=new Date(),seconds=Math.max(86400,getExpiresInSeconds())+60,expiresAt=new Date(Date.now()+seconds*1000);
 await database.accessRevocation.upsert({where:{key:'user:'+userId},create:{key:'user:'+userId,revokedAt,expiresAt},update:{revokedAt,expiresAt}});
 // A password-reset transaction must commit revocation with the password.
 // Readers always consult PostgreSQL; do not perform Redis I/O while holding its locks.
 if(database!==prisma)return;
 try {await store().set('auth:revoked-user:'+userId,String(revokedAt.getTime()),'EX',seconds);} catch { /* DB remains authoritative */ }
}
