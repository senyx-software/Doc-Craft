import type { JWTPayload } from 'jose';
import type { ServiceConfig } from './service-auth.mjs';
export function signUserToken(type:'access'|'refresh'|'mfa',claims:JWTPayload,expires?:string|number,config?:ServiceConfig):Promise<string>;
export function verifyUserToken(token:string,type?:'access'|'refresh'|'mfa',config?:ServiceConfig):Promise<JWTPayload>;
