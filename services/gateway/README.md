# DocCraft API Gateway Service

A production-grade, Express-based API Gateway that serves as the entry point for the DocCraft microservices platform.

---

## Sole Responsibilities
1. **Authentication**: Signature and expiry verification of incoming JWT Bearer tokens.
2. **Reverse Proxying**: Dynamic request routing to internal services on the Docker network.
3. **SSE Relay**: Zero-buffer stream relaying for Server-Sent Events (SSE).
4. **Rate Limiting**: Sliding window rate limits backed by Redis.
5. **Security**: Helmet headers and CORS allowlist enforcement.

---

## Folder Structure
```
src/
├── config/           # Validated environment configs
├── controllers/      # Proxy route handlers (REST, SSE, health)
├── middleware/       # JWT verifier, rate limiter, JSON logger, error formatter
├── routes/           # Path group mapping matching tech spec routes
├── security/         # CORS and Helmet configurations
├── services/         # ServiceRegistry, proxyClient, and SSERelay
└── index.ts          # Express startup and graceful shutdown hooks
```

---

## Route Table

| Path Prefix | Target Upstream Service | Public Routes (Auth Bypass) |
|---|---|---|
| `/v1/auth/*` | `AUTH_SERVICE_URL` | `/v1/auth/register`, `/v1/auth/login`, `/v1/auth/guest`, `/v1/auth/password-reset`, `/v1/auth/oauth/*` |
| `/v1/users/*` | `AUTH_SERVICE_URL` | None |
| `/v1/ai/*` | `AI_SERVICE_URL` | None (except stream relay `/v1/ai/message`) |
| `/v1/chat/*` | `AI_SERVICE_URL` | None (except stream relay `/v1/chat/message`) |
| `/v1/payment/*` | `BILLING_SERVICE_URL` | `/v1/payment/plans`, `/v1/payment/webhook/*` |
| `/v1/quota/*` | `QUOTA_SERVICE_URL` | `/v1/quota/guest/*` |
| `/v1/documents/*`| `DOCUMENT_SERVICE_URL` | None |
| `/v1/templates/*`| `DOCUMENT_SERVICE_URL` | None |
| `/v1/analytics/*`| `ANALYTICS_SERVICE_URL` | None |
| `/v1/admin/*` | `ADMIN_API_SERVICE_URL` | None |
| `/health` | (Gateway Liveness) | `/health`, `/health/deep` |

---

## How the SSE Stream Relay Works
The gateway acts as a high-performance transparent stream pipeline for real-time tokens (e.g. streaming Claude responses from `ai` service to client).

1. **Flush Headers Immediately**: Responds immediately with `200 OK` and headers:
   - `Content-Type: text/event-stream`
   - `Cache-Control: no-cache, no-transform`
   - `Connection: keep-alive`
   - `X-Accel-Buffering: no` (disables downstream buffering in Nginx/Cloudflare)
2. **Disable Buffering / Socket Delays**: Disables Nagle's algorithm on the TCP socket using `res.socket.setNoDelay(true)`.
3. **Heartbeat Pings**: Sends an empty comment block `: ping\n\n` every 15 seconds to prevent Railway/Cloudflare connections from timing out during quiet periods.
4. **Graceful Disconnects**:
   - If the **client disconnects** (`req.on('close')`), the gateway aborts the upstream fetch request instantly, avoiding orphaned background tasks.
   - If the **upstream service errors or disconnects**, the gateway formats and emits an `event: error` JSON payload to the client before terminating the stream cleanly.

---

## Setup & Running
1. Copy `.env.example` to `.env` and fill in the values:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in development:
   ```bash
   npm run dev
   ```
4. Build and start in production:
   ```bash
   npm run build
   npm start
   ```
