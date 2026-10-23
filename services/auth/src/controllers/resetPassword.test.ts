import { beforeEach, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
const m = vi.hoisted(() => ({ find: vi.fn(), claim: vi.fn(), user: vi.fn(), sessions: vi.fn(), revoke: vi.fn(), hash: vi.fn(), transaction: vi.fn() }));
vi.mock('../db/prisma.js', () => ({prisma:{passwordReset:{findUnique:m.find},$transaction:m.transaction}}));
vi.mock('../services/password.service.js', () => ({hashPassword:m.hash,validatePasswordStrength:(p:string)=>({valid:p.length>=12,message:'Weak password'}),verifyPassword:vi.fn()}));
vi.mock('../services/access-revocation.service.js', () => ({revokeAllAccess:m.revoke,revokeAccess:vi.fn()}));
vi.mock('../services/email.service.js', () => ({sendWelcomeEmail:vi.fn(),sendPasswordResetEmail:vi.fn(),sendVerificationEmail:vi.fn()}));
vi.mock('../services/loginTracking.service.js', () => ({recordLoginEvent:vi.fn()}));
vi.mock('../services/productTracking.service.js', () => ({trackProductEvent:vi.fn()}));
import { resetPassword } from './auth.controller.js';
import { tokenDigest } from '../services/token-digest.service.js';
const tx={passwordReset:{updateMany:m.claim},user:{update:m.user},session:{deleteMany:m.sessions}};
let token:string,record:any;
const reply=()=>({status:vi.fn().mockReturnThis(),send:vi.fn().mockReturnThis()});
beforeEach(()=>{
 vi.resetAllMocks();token=randomBytes(32).toString('hex');
 record={id:'owned-reset',userId:'owned-user',used:false,expiresAt:new Date(Date.now()+60000)};
 m.find.mockResolvedValue(record);m.hash.mockResolvedValue('unused-test-hash');m.claim.mockResolvedValue({count:1});m.transaction.mockImplementation(fn=>fn(tx));
});
it('conditionally claims token, password, sessions and access revocation in one transaction',async()=>{
 const res=reply();await resetPassword({body:{token,newPassword:randomBytes(24).toString('hex')}} as any,res as any);
 expect(m.find).toHaveBeenCalledWith({where:{token:tokenDigest(token)}});
 expect(m.claim).toHaveBeenCalledWith({where:{id:record.id,used:false,expiresAt:{gt:expect.any(Date)}},data:{used:true}});
 expect(m.sessions).toHaveBeenCalledWith({where:{userId:record.userId}});expect(m.revoke).toHaveBeenCalledWith(record.userId,tx);
 expect(res.send).toHaveBeenCalledWith(expect.objectContaining({success:true}));
});
it('losing concurrent claim cannot mutate credentials or sessions',async()=>{
 m.claim.mockResolvedValueOnce({count:1}).mockResolvedValueOnce({count:0});const replies=[reply(),reply()];
 await Promise.all(replies.map(res=>resetPassword({body:{token,newPassword:randomBytes(24).toString('hex')}} as any,res as any)));
 expect(m.user).toHaveBeenCalledOnce();expect(m.sessions).toHaveBeenCalledOnce();expect(replies[1].status).toHaveBeenCalledWith(400);
});
it.each(['used','expired','missing'])('rejects %s token before password mutation',async(kind)=>{
 m.find.mockResolvedValue(kind==='missing'?null:{...record,used:kind==='used',expiresAt:new Date(kind==='expired'?0:Date.now()+60000)});
 const res=reply();await resetPassword({body:{token,newPassword:randomBytes(24).toString('hex')}} as any,res as any);expect(res.status).toHaveBeenCalledWith(400);expect(m.transaction).not.toHaveBeenCalled();
});
it('rejects a stored token digest as a credential',async()=>{
 const res=reply();await resetPassword({body:{token:tokenDigest(token),newPassword:randomBytes(24).toString('hex')}} as any,res as any);expect(res.status).toHaveBeenCalledWith(400);expect(m.find).not.toHaveBeenCalled();
});
it('does not consume a token for a weak password',async()=>{
 const res=reply();await resetPassword({body:{token,newPassword:'weak'}} as any,res as any);expect(res.status).toHaveBeenCalledWith(400);expect(m.claim).not.toHaveBeenCalled();
});
