import { env } from '../config/env.js';
export async function authorizedProfile(userId:string,authorization?:string):Promise<{timezone:string;available:boolean;timezoneConfigured?:boolean}> {
  if(!authorization||!env.AUTH_SERVICE_URL)return {timezone:'UTC',available:false};
  try {
    const response=await fetch(env.AUTH_SERVICE_URL+'/v1/auth/me',{headers:{Authorization:authorization},signal:AbortSignal.timeout(2000)});
    if(!response.ok)return {timezone:'UTC',available:false};
    const profile=(await response.json() as any).user;
    if(profile?.id!==userId)return {timezone:'UTC',available:false};
    const timezone=typeof profile.timezone==='string'?profile.timezone:'UTC';
    new Intl.DateTimeFormat('en',{timeZone:timezone}).format();
    // Personal name/email are deliberately not business-field candidates.
    return {timezone,available:true,...(typeof profile.timezone==='string'?{}:{timezoneConfigured:false})};
  }catch{return {timezone:'UTC',available:false};}
}
