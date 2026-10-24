import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),patch:vi.fn()}));
vi.mock('../client',()=>m);
import {getProfile,updateProfile} from '../users';
beforeEach(()=>{const result={user:{id:'owned-user',email:'person@example.com',twoFactorEnabled:true}};m.get.mockResolvedValue(result);m.patch.mockResolvedValue(result);});
it('both profile reads and profile saves retain authoritative MFA state',async()=>{expect((await getProfile()).twoFactorEnabled).toBe(true);expect((await updateProfile({full_name:'Person'})).twoFactorEnabled).toBe(true);});
