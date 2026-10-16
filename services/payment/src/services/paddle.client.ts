/**
 * paddle.client.ts — the shared Paddle SDK client instance.
 *
 * This is a leaf module: it imports only config. Both paddle.service.ts and
 * subscription.service.ts import the client from here, which keeps those two
 * modules free of any circular dependency on each other.
 */

import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import { env } from '../config/env.js';

let client:Paddle|undefined;
export const paddle=new Proxy({} as Paddle,{get(_target,key){
  if(!env.PADDLE_API_KEY)throw Object.assign(new Error('Paddle sandbox credentials are not configured'),{statusCode:503});
  client??=new Paddle(env.PADDLE_API_KEY,{environment:env.PADDLE_SANDBOX?Environment.sandbox:Environment.production});
  const value=Reflect.get(client,key);return typeof value==='function'?value.bind(client):value;
}});
