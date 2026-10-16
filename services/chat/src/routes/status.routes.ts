import { authorizeService } from '../../../../shared/service-auth.mjs';
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";

function isConfigured(value: string | undefined): boolean {
  return Boolean(value) && !value!.toUpperCase().includes("REPLACE");
}

export async function statusRoutes(fastify: FastifyInstance) {
  fastify.get("/internal/status/keys", async (req: FastifyRequest, reply: FastifyReply) => {
    try {await authorizeService('chat', req);}
    catch(error){return reply.status((error as {statusCode?:number}).statusCode || 503).send({error:'Service authorization rejected'});}

    return {
      keys: [
        {
          id: "anthropic",
          name: "Anthropic Claude Secret API",
          configured: isConfigured(env.ANTHROPIC_API_KEY),
        },
      ],
    };
  });
}
