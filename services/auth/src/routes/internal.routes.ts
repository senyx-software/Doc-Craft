import {anonymizeAccount} from '../services/account-anonymization.service.js';
import { FastifyInstance } from 'fastify';
import { listUsers, getUserById, updateUserStatus, updateUserPlan, verifyInternalToken, listReferrals, createReferral, convertReferral, getUserCountsByPlan } from '../controllers/internal.controller.js';
import { authorizeService, captureServiceBody } from '../../../../shared/service-auth.mjs';

export async function internalRoutes(fastify: FastifyInstance) {
  fastify.addHook('preParsing', captureServiceBody);
  fastify.addHook('preValidation', async (request, reply) => {
    try { await authorizeService('auth', request); }
    catch (error) { return reply.status((error as {statusCode?:number}).statusCode || 503).send({error:'Service authorization rejected'}); }
  });
  fastify.post('/users/:id/anonymize',async(request,reply)=>{
    try{return await anonymizeAccount((request.params as {id:string}).id);}
    catch(error){return reply.status((error as {statusCode?:number}).statusCode || 503).send({error:'Account anonymization unavailable'});}
  });
  const tags = ['Internal Admin API'];

  fastify.get('/users', {
    schema: {
      tags,
      summary: 'List Users (Internal)',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' },
          search: { type: 'string' },
          status: { type: 'string' },
          plan: { type: 'string' },
          isGuest: { type: 'string' }
        }
      }
    }
  }, listUsers);

  fastify.get('/users/:id', {
    schema: {
      tags,
      summary: 'Get User (Internal)',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, getUserById);

  fastify.patch('/users/:id/status', {
    schema: {
      tags,
      summary: 'Update User Status (Internal)',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string' }
        }
      }
    }
  }, updateUserStatus);

  fastify.patch('/users/:id/plan', {
    schema: {
      tags,
      summary: 'Update User Plan (Internal)',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['plan'],
        properties: {
          plan: { type: 'string' }
        }
      }
    }
  }, updateUserPlan);

  fastify.get('/users/stats-by-plan', {
    schema: { tags, summary: 'Get User Counts By Plan (Internal)', querystring: { type: 'object', properties: {} } },
  }, getUserCountsByPlan);

  fastify.get('/referrals', {
    schema: { tags, summary: 'List Referrals (Internal)', querystring: { type: 'object', properties: { status: { type: 'string' } } } },
  }, listReferrals);

  fastify.post('/referrals', {
    schema: {
      tags,
      summary: 'Create Referral (Internal)',
      body: {
        type: 'object',
        required: ['referrer_user_id', 'referred_email', 'code'],
        properties: {
          referrer_user_id: { type: 'string' },
          referred_email: { type: 'string' },
          code: { type: 'string' },
        },
      },
    },
  }, createReferral);

  fastify.patch('/referrals/:id/convert', {
    schema: {
      tags,
      summary: 'Convert Referral (Internal)',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, convertReferral);

  fastify.post('/verify-token', {
    schema: {
      tags,
      summary: 'Verify User Token/Status (Internal)',
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      }
    }
  }, verifyInternalToken);
}
