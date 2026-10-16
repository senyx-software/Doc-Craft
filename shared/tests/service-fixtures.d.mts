import type { KeyObject } from 'node:crypto';
import type { ServiceConfig } from '../service-auth.mjs';
export const userPrivateKey: KeyObject;
export function fixtureConfig(identity:string): ServiceConfig;
export function configureServiceFixture(identity:string):void;
export function userToken(subject?:string,type?:string,claims?:Record<string,unknown>):Promise<string>;
export function serviceHeaders(caller:string,target:string,method:string,path:string,body?:string):Promise<Record<string,string>>;
