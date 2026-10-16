import {accessIsRevoked} from '../services/access-revocation.service.js';
import {verifyAccessToken} from '../services/jwt.service.js';
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';

export const listUsers = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page = 1, limit = 10, search, status, plan, isGuest } = request.query as any;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (isGuest !== undefined) where.isGuest = isGuest === 'true';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          plan: true,
          userClass: true,
          status: true,
          isGuest: true,
          lastLoginAt: true,
          createdAt: true,
          twoFactorEnabled: true,
          authProvider: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    return reply.send({ data: users, meta: { total, page: Number(page), limit: take } });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Failed to list users', error: error.message });
  }
};

export const getUserById = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as any;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        plan: true,
        userClass: true,
        status: true,
        isGuest: true,
        lastLoginAt: true,
        createdAt: true,
        twoFactorEnabled: true,
        authProvider: true,
        emailVerified: true
      }
    });

    if (!user) {
      return reply.status(404).send({ message: 'User not found' });
    }

    return reply.send(user);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Failed to get user', error: error.message });
  }
};

export const updateUserStatus = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as any;
    const { status } = request.body as any;

    if (!status) {
      return reply.status(400).send({ message: 'Status is required' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        email: true,
        status: true
      }
    });

    return reply.send({ message: 'User status updated', user });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Failed to update user status', error: error.message });
  }
};

export const updateUserPlan = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as any;
    const { plan } = request.body as any;

    if (!plan) {
      return reply.status(400).send({ message: 'Plan is required' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { plan },
      select: {
        id: true,
        email: true,
        plan: true
      }
    });

    return reply.send({ message: 'User plan updated', user });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Failed to update user plan', error: error.message });
  }
};

export const getUserCountsByPlan = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const grouped = await prisma.user.groupBy({
      by: ['plan'],
      _count: { _all: true },
      where: { isGuest: false },
    });
    const counts: Record<string, number> = {};
    for (const g of grouped) {
      counts[g.plan] = g._count._all;
    }
    return reply.send({ data: counts });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Failed to get user counts by plan', error: error.message });
  }
};

export const listReferrals = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { status } = request.query as { status?: string };
    const referrals = await prisma.referral.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: referrals });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Failed to list referrals', error: error.message });
  }
};

export const createReferral = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { referrer_user_id, referred_email, code } = request.body as {
      referrer_user_id?: string; referred_email?: string; code?: string;
    };
    if (!referrer_user_id || !referred_email || !code) {
      return reply.status(400).send({ message: 'referrer_user_id, referred_email, and code are required' });
    }
    const referral = await prisma.referral.create({
      data: { referrerUserId: referrer_user_id, referredEmail: referred_email, code: code.toUpperCase() },
    });
    return reply.status(201).send({ data: referral });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Failed to create referral', error: error.message });
  }
};

export const convertReferral = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const existing = await prisma.referral.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ message: 'Referral not found' });
    }
    const referral = await prisma.referral.update({
      where: { id },
      data: { status: 'converted', convertedAt: new Date(), rewardGranted: true },
    });
    return reply.send({ data: referral });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Failed to convert referral', error: error.message });
  }
};

export const verifyInternalToken = async (request: FastifyRequest, reply: FastifyReply) => {
  // A simple endpoint to verify a user's token or session for internal services
  // if Admin needs to do some auth contract validations.
  try {
    const {userId,token}=request.body as {userId?:string;token?:string};
    if(!token)return reply.status(401).send({valid:false});
    try{
      if((await verifyAccessToken(token)).sub!==userId || await accessIsRevoked(token))return reply.status(401).send({valid:false});
    }catch(error){
      const invalid=error instanceof Error && (error.name.startsWith('JWT')||error.name.startsWith('JWS'));
      return reply.status(invalid?401:503).send({valid:false});
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, plan: true, deletedAt: true }
    });
    if (!user) return reply.status(404).send({ valid: false, message: 'User not found' });
    return reply.send({ valid: user.status === 'active' && !user.deletedAt, user: { id: user.id, status: user.status, plan: user.plan } });
  } catch (error: any) {
    return reply.status(500).send({ valid: false, error: error.message });
  }
};
