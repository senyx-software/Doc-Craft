import cors from 'cors';
import { env } from '../config/env.js';

export const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (mobile apps, curl)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Match origin against allowlist or allow any localhost in development
    const isLocal = env.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'));
    const allowed = isLocal || env.CORS_ORIGINS.some((allowedOrigin) => {
      if (allowedOrigin === '*') return true;
      return origin === allowedOrigin;
    });

    if (allowed) {
      callback(null, true);
    } else {
      console.warn(`[gateway/security] CORS blocked origin: ${origin}`);
      callback(new Error('CORS Policy: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    'x-user-id',
    'x-user-plan',
    'x-user-email',
  ],
});
