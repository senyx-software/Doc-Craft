/**
 * loginTracking.service.ts — records a real device/location fingerprint for
 * every successful login.
 *
 * "Device" comes from parsing the request's real User-Agent header with
 * ua-parser-js (deterministic parsing of a header the browser actually
 * sent — never a fixed/guessed split). "Location" comes from geoip-lite, a
 * fully offline MaxMind-derived GeoIP database bundled with the package —
 * a real best-effort IP→country lookup, no external API call, no guess.
 *
 * Never awaited from the login critical path: a failure here must not
 * block or fail a real login.
 */
import type { FastifyRequest } from 'fastify';
import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';
import { prisma } from '../db/prisma.js';

export function recordLoginEvent(userId: string, request: FastifyRequest): void {
  try {
    const ipAddress = request.ip || '127.0.0.1';
    const userAgent = (request.headers['user-agent'] as string) || '';

    const ua = UAParser(userAgent);
    const deviceType = ua.device.type || 'desktop'; // ua-parser-js leaves this undefined for desktop
    const browser = ua.browser.name || null;
    const os = ua.os.name || null;

    // Loopback/private addresses (local dev) have no real geo entry — that's
    // an honest "unknown", not something to fake a country for.
    const geo = geoip.lookup(ipAddress);
    const country = geo?.country || null;

    prisma.loginEvent
      .create({
        data: { userId, ipAddress, userAgent, deviceType, browser, os, country },
      })
      .catch((err: any) => {
        console.warn('[auth] recordLoginEvent insert failed:', (err as Error).message);
      });
  } catch (err) {
    console.warn('[auth] recordLoginEvent failed:', (err as Error).message);
  }
}
