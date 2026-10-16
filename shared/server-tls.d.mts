import type { Server, RequestListener } from 'node:http';
export function serverTlsOptions():{cert:Buffer;key:Buffer;minVersion:'TLSv1.2'}|undefined;
export function createAppServer(app:RequestListener):Server;
/** Common listener options preserve HTTP request types for optional TLS. */
export function fastifyTlsOptions():import('fastify').FastifyServerOptions;
