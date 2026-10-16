/**
 * invoice.service.ts — billing invoice history.
 */

import { prisma } from '../db/prisma.js';

export async function getUserInvoices(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [invoices, total] = await Promise.all([
    prisma.billingInvoice.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    limit,
    }),
    prisma.billingInvoice.count({ where: { userId } }),
  ]);

  return {
    invoices,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
