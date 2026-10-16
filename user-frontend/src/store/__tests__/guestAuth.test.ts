import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({token:null as string|null,guest:vi.fn(),me:vi.fn(),login:vi.fn(),login2FA:vi.fn(),transfer:vi.fn(),reopen:vi.fn()}));
vi.mock('../../api/auth',()=>({guestLogin:mocks.guest,getMe:mocks.me,login:mocks.login,login2FA:mocks.login2FA}));
vi.mock('../chatStore',()=>({useChatStore:{getState:()=>({sessionId:null,loadSessionFromDb:mocks.reopen})}}));
vi.mock('../../api/client',()=>({apiRequest:mocks.transfer,getToken:()=>mocks.token,setToken:(token:string)=>{mocks.token=token;},clearToken:()=>{mocks.token=null;},isTokenExpired:(token:string)=>token==='expired',getTokenExpiry:()=>Date.now()+86400000}));
vi.mock('../../lib/firebase',()=>({getGoogleIdToken:vi.fn(),googleSignInError:vi.fn()}));
import {useAuthStore} from '../authStore';
const guest={session_token:'new-guest',guest_user_id:'guest_test',expires_at:new Date(Date.now()+86400000).toISOString()};
beforeEach(()=>{vi.resetAllMocks();mocks.token=null;useAuthStore.setState({user:null,isAuthenticated:false,isGuest:false,guestSession:null,isLoading:false,isInitializing:true,error:null});mocks.guest.mockResolvedValue(guest);});
it('guest login saves a valid guest session and finishes initialization',async()=>{await useAuthStore.getState().guestLogin();expect(mocks.token).toBe('new-guest');expect(useAuthStore.getState()).toMatchObject({isAuthenticated:true,isGuest:true,isLoading:false,isInitializing:false,user:{user_id:'guest_test',auth_provider:'guest',plan:'guest'}});});
it('refresh restores the guest identity and token expiration from the verified profile',async()=>{mocks.token='new-guest';mocks.me.mockResolvedValue({user_id:'guest_test',plan:'guest',auth_provider:'guest'});await useAuthStore.getState().checkAuth();expect(useAuthStore.getState()).toMatchObject({isAuthenticated:true,isGuest:true,guestSession:{session_token:'new-guest',guest_user_id:'guest_test'},isInitializing:false});});
it('a late old-profile failure cannot clear a newer guest login',async()=>{mocks.token='old';let reject!:(reason: Error) => void;mocks.me.mockImplementation(()=>new Promise((_resolve,r)=>{reject=r;}));const checking=useAuthStore.getState().checkAuth();await useAuthStore.getState().guestLogin();reject(new Error('Old login failed'));await checking;expect(mocks.token).toBe('new-guest');expect(useAuthStore.getState().isGuest).toBe(true);});
it('a late old profile success cannot replace a newer guest login',async()=>{mocks.token='old';let resolve!:(value: {user_id: string; plan: string}) => void;mocks.me.mockImplementation(()=>new Promise<{user_id: string; plan: string}>(r=>{resolve=r;}));const checking=useAuthStore.getState().checkAuth();await useAuthStore.getState().guestLogin();resolve({user_id:'older-user',plan:'free'});await checking;expect(useAuthStore.getState().user?.user_id).toBe('guest_test');});
it('timeout releases Connecting as Guest and permits retry',async()=>{mocks.guest.mockRejectedValue(Object.assign(new Error('Timed out'),{name:'TimeoutError'}));await expect(useAuthStore.getState().guestLogin()).rejects.toThrow();expect(useAuthStore.getState()).toMatchObject({isLoading:false,isAuthenticated:false,error:'Guest connection timed out. Please try again.'});mocks.guest.mockResolvedValue(guest);await useAuthStore.getState().guestLogin();expect(useAuthStore.getState().isGuest).toBe(true);});
it('invalid guest response never creates a token or authenticated identity',async()=>{mocks.guest.mockResolvedValue({guest_user_id:'guest_test'});await expect(useAuthStore.getState().guestLogin()).rejects.toThrow(/valid session/);expect(mocks.token).toBeNull();expect(useAuthStore.getState().isAuthenticated).toBe(false);});
it('expired authentication clears all guest metadata',async()=>{mocks.token='expired';useAuthStore.setState({isGuest:true,guestSession:guest});await useAuthStore.getState().checkAuth();expect(mocks.token).toBeNull();expect(useAuthStore.getState()).toMatchObject({isGuest:false,guestSession:null,isInitializing:false});});

it.each(['login', 'login2FA'] as const)('malformed %s account data cannot persist an access token', async method => {
 mocks[method].mockResolvedValue({accessToken: 'fixture-invalid-account', user: {}});
 useAuthStore.setState({mfaToken: 'fixture-mfa'});
 const operation = method === 'login' ? useAuthStore.getState().login('fixture@example.test', 'fixture-password') : useAuthStore.getState().login2FA('123456');
 await expect(operation).rejects.toThrow('Invalid account response');
 expect(mocks.token).toBeNull();
 expect(useAuthStore.getState().isAuthenticated).toBe(false);
});

it('guest sign-in uses the new account credential for transfer before discarding the guest identity',async()=>{
 mocks.token='guest-token';useAuthStore.setState({isGuest:true,isAuthenticated:true,user:{user_id:'guest_test',email:'guest@example.test',auth_provider:'guest',plan:'guest'}});
 mocks.login.mockResolvedValue({accessToken:'account-token',user:{id:'account',email:'account@example.test',plan:'free'}});
 mocks.transfer.mockResolvedValue({sessionIds:['saved-draft']});
 await useAuthStore.getState().login('account@example.test','fixture-password');
 expect(mocks.transfer).toHaveBeenCalledWith('/chat/api/chat/guest-migration',expect.objectContaining({auth:false,headers:{Authorization:'Bearer account-token'},body:{guestToken:'guest-token'}}));
 expect(mocks.reopen).toHaveBeenCalledWith('saved-draft');
 expect(useAuthStore.getState()).toMatchObject({isGuest:false,user:{user_id:'account'}});
});
