import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '../generated/prisma/index.js';

// Existing domain helpers share one transaction without opening nested transactions.
export const paymentTransaction = new AsyncLocalStorage<{tx:Prisma.TransactionClient;eventId:string;sequence:number}>();
