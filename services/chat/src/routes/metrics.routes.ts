import { FastifyInstance } from "fastify";
import { registry } from "../services/metrics.service.js";
import { authorizeService } from '../../../../shared/service-auth.mjs';

export async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get("/metrics", async (req, reply) => {
    try { await authorizeService('chat', req); }
    catch(error) { return reply.status((error as {statusCode?:number}).statusCode || 503).send({error:'Service authorization rejected'}); }
    reply.header("Content-Type", registry.contentType);
    return registry.metrics();
  });
}
