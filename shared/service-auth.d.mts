import type { Readable } from 'node:stream';
export interface ServiceConfig { totp_encryption?:{active_kid:string;keys:Record<string,string>}; version: 1; identity: string; send: Record<string,{kid:string;secret:string}>; receive: Record<string,Record<string,string>>; queue_send?:Record<string,{kid:string;secret:string}>; queue_receive?:Record<string,Record<string,Record<string,string>>>; user_jwt?:{kid?:string;private_key?:string;public_keys:Record<string,string>} }
export function serviceConfig(): ServiceConfig;
export function permitted(receiver:string,caller:string,method:string,path:string):boolean;
export function serviceToken(receiver:string,method:string,url:string,body?:string|Buffer,config?:ServiceConfig):Promise<string>;
export function serviceFetch(receiver:string,url:string|URL,options?:RequestInit):Promise<Response>;
export function captureRawServiceBody(request:object,buffer:Buffer):void;
export function captureServiceBody(request:unknown,reply:unknown,payload:Readable,done:(error:Error|null,payload?:Readable)=>void):void;
export function authorizeService(receiver:string,request:{headers:Record<string,string|string[]|undefined>;method:string;url?:string;originalUrl?:string;raw?:{url?:string};rawBody?:string|Buffer},claim?:(receiver:string,caller:string,kid:string,nonce:string,seconds:number,issuedAt?:number)=>Promise<boolean>):Promise<string>;
export function closeServiceAuth():Promise<void>;

export const serviceNonceStore:{claim:(receiver:string,caller:string,kid:string,nonce:string,seconds:number,issuedAt?:number)=>Promise<boolean>};
