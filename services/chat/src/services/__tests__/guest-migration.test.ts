import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({verify:vi.fn(),fetch:vi.fn()}));
vi.mock('../../../../../shared/user-auth.mjs',()=>({verifyUserToken:mocks.verify}));
vi.mock('../../../../../shared/service-auth.mjs',()=>({serviceFetch:mocks.fetch}));
vi.mock('../db.service.js',()=>({db:{}}));
import {migrateGuestDrafts} from '../guest-migration.service.js';
beforeEach(()=>{vi.resetAllMocks();mocks.verify.mockResolvedValue({sub:'guest_fixture',plan:'guest'});mocks.fetch.mockResolvedValue({ok:true,json:async()=>({valid:true,user:{id:'guest_fixture',plan:'guest'}})});});
function database(owner='account'){const tx={guestMigration:{upsert:vi.fn(async()=>({userId:owner,sessionIds:['draft']}))},chatSession:{findMany:vi.fn(async()=>[{id:'draft'}]),updateMany:vi.fn(async()=>({count:2}))}};return {$transaction:async(fn:any)=>fn(tx),tx} as any;}
it('requires both current account and verified guest credential before moving drafts',async()=>{const db=database();expect(await migrateGuestDrafts('account','token',db)).toEqual({migrated:2,sessionIds:['draft']});expect(db.tx.chatSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({userId:'guest_fixture'}),data:{userId:'account',expiresAt:null}}));});
it('an existing claim cannot be stolen by a second account',async()=>{const db=database('other');await expect(migrateGuestDrafts('account','token',db)).rejects.toMatchObject({statusCode:409});expect(db.tx.chatSession.updateMany).not.toHaveBeenCalled();});
it('registered-user credentials and revoked guests cannot migrate',async()=>{mocks.verify.mockResolvedValueOnce({sub:'other-account',plan:'free'});await expect(migrateGuestDrafts('account','token',database())).rejects.toMatchObject({statusCode:403});mocks.fetch.mockResolvedValueOnce({ok:false,status:401});await expect(migrateGuestDrafts('account','token',database())).rejects.toMatchObject({statusCode:401});});
