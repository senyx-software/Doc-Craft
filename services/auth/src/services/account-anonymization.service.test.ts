import {it,expect,vi} from 'vitest';
const tx=vi.hoisted(()=>({user:{findUnique:vi.fn(),update:vi.fn()},session:{deleteMany:vi.fn()},passwordReset:{deleteMany:vi.fn()}}));
vi.mock('../db/prisma.js',()=>({prisma:{$transaction:vi.fn(async callback=>callback(tx))}}));
import {anonymizeAccount} from './account-anonymization.service.js';
it('atomically removes credentials and sessions through the Auth-owned transaction, including retries',async()=>{
 tx.user.findUnique.mockResolvedValueOnce({id:'owner',email:'person@example.com',status:'active'});
 const first=await anonymizeAccount('owner');expect(first.anonymized_email).toMatch(/^deleted-[a-f0-9]{32}@purged/);
 expect(tx.user.update).toHaveBeenCalledWith({where:{id:'owner'},data:expect.objectContaining({passwordHash:null,totpSecret:null,pendingTotpSecret:null,refreshTokenHash:null,status:'deleted'})});
 expect(tx.session.deleteMany).toHaveBeenCalledWith({where:{userId:'owner'}});expect(tx.passwordReset.deleteMany).toHaveBeenCalledWith({where:{userId:'owner'}});
 tx.user.findUnique.mockResolvedValueOnce({id:'owner',email:first.anonymized_email,status:'deleted'});
 expect(await anonymizeAccount('owner')).toEqual(first);
});
