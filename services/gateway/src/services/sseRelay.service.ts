import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { upstreamPath } from './upstreamPath.js';
export class SSERelayService {
    static async relay(req: Request, res: Response, targetBaseUrl: string) {
        const requestId = String(req.headers['x-request-id'] || randomUUID());
        const controller = new AbortController();
        const disconnected = () => { if (!res.writableEnded)
            controller.abort(); };
        res.on('close', disconnected);
        req.on('aborted', disconnected);
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        try {
            const headers = new Headers({ 'Accept': 'text/event-stream', 'X-Request-Id': requestId });
            if (req.headers.authorization)
                headers.set('authorization', req.headers.authorization);
            if (req.headers['content-type'])
                headers.set('content-type', String(req.headers['content-type']));
            const response = await fetch(new URL(upstreamPath(req.originalUrl), targetBaseUrl), { method: req.method, headers, body: req.body ? JSON.stringify(req.body) : undefined, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(135000)]) });
            if (!response.ok) {
                // Preserve HTTP status. Never turn an upstream rejection into HTTP 200.
                let upstream:any={};try{upstream=await response.json();}catch{}
                const upstreamCode = upstream.code || upstream.error?.code;
                const safeCode=typeof upstreamCode==='string'&&/^[A-Z_]{1,64}$/.test(upstreamCode)?upstreamCode:response.status===429?'CHAT_RATE_LIMITED':'UPSTREAM_ERROR';
                const retryAfter = Number(response.headers.get('retry-after') || upstream.retryAfter);
                if (Number.isFinite(retryAfter) && retryAfter > 0) res.setHeader('Retry-After', String(retryAfter));
                res.status(response.status).json({type:'error',outcome:'failure',code:safeCode,status:response.status,phase:upstream.phase||'gateway',retryable:upstream.retryable??(response.status>=500||response.status===429),...(Number.isFinite(retryAfter)&&retryAfter>0?{retryAfter}:{}),...(upstream.state?{state:upstream.state}:{}),requestId});
                return;
            }
            if (!response.body) {
                res.status(502).json({ type: 'error', outcome: 'incomplete', code: 'NO_BODY', status: 502 });
                return;
            }
            res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'X-Request-Id': requestId });
            res.flushHeaders();
            heartbeat = setInterval(() => { if (!res.destroyed)
                res.write(': ping\n\n'); }, 15000);
            const reader = response.body.getReader();
            try {
                while (true) {
                    const chunk = await reader.read();
                    if (chunk.done)
                        break;
                    if (res.destroyed)
                        break;
                    res.write(chunk.value);
                }
            }
            finally {
                await reader.cancel().catch(() => { });
                reader.releaseLock();
            }
            res.end();
        }
        catch {
            if (res.destroyed)
                return;
            const event = { type: 'error', outcome: controller.signal.aborted ? 'cancelled' : 'incomplete', code: 'STREAM_INTERRUPTED', status: 502, requestId };
            if (res.headersSent)
                res.end('data: ' + JSON.stringify(event) + '\n\n');
            else
                res.status(502).json(event);
        }
        finally {
            if (heartbeat)
                clearInterval(heartbeat);
            res.off('close', disconnected);
            req.off('aborted', disconnected);
        }
    }
}
