import {it,expect,vi,afterEach} from 'vitest';
vi.mock('../../config/env.js',()=>({env:{AUTH_SERVICE_URL:'http://isolated.test'}}));
import {authorizedProfile} from '../profileClient.service.js';
afterEach(()=>vi.unstubAllGlobals());
it('only verified matching profile timezone is reusable, never personal business identity',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({user:{id:'u',timezone:'Asia/Colombo',fullName:'Personal name',email:'personal@test'}})));expect(await authorizedProfile('u','Bearer synthetic')).toEqual({timezone:'Asia/Colombo',available:true});});
it('mismatched profile, failed lookup and invalid timezone are unavailable, not business facts',async()=>{for(const profile of [{id:'other',timezone:'UTC'},{id:'u',timezone:'invalid'}]){vi.stubGlobal('fetch',vi.fn(async()=>Response.json({user:profile})));expect((await authorizedProfile('u','Bearer synthetic')).available).toBe(false);}vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));expect(await authorizedProfile('u','Bearer synthetic')).toEqual({timezone:'UTC',available:false});});
