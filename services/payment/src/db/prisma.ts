import { PrismaClient } from '../generated/prisma/index.js';
import { paymentTransaction } from './transaction-context.js';
import { env } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const paymentDatabase =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = paymentDatabase;
}

export const prisma = new Proxy(paymentDatabase, {get(target,key) {
  const client=paymentTransaction.getStore()?.tx || target;
  const value=Reflect.get(client,key);
  return typeof value==='function'?value.bind(client):value;
}});
