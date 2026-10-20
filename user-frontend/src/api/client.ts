/**
 * Centralized API Client for DocCraft
 * All HTTP requests to the backend go through this module.
 * Base URL is configured via VITE_API_BASE_URL environment variable.
 */

import type { ApiError } from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/v1';

/** Set cookie for token persistence */
export function setCookieToken(token: string, days = 7): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `doccraft_token=${encodeURIComponent(token)}; expires=${expires}; path=/; SameSite=Lax`;
}

/** Get token from cookies */
export function getCookieToken(): string | null {
  if (typeof document === 'undefined') return null;
  const name = 'doccraft_token=';
  try {
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      const c = ca[i].trim();
      if (c.indexOf(name) === 0) {
        return c.substring(name.length, c.length);
      }
    }
  } catch {
    // Return null if cookie string cannot be decoded
  }
  return null;
}

/** Clear token cookie */
export function clearCookieToken(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'doccraft_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
}

/** Check if JWT token is expired */
export function getTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload && typeof payload.exp === 'number') {
      return payload.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

export function isTokenExpired(token: string): boolean {
  if (token === 'demo_token_for_testing') return false;
  const expiry = getTokenExpiry(token);
  return expiry === null || Date.now() >= expiry - 10000;
}

/** Get the auth token from cookie first, then localStorage */
export function getToken(): string | null {
  const cookieToken = getCookieToken();
  if (cookieToken) return cookieToken;
  return localStorage.getItem('doccraft_token');
}

/** Set the auth token in both cookie and localStorage */
export function setToken(token: string): void {
  localStorage.setItem('doccraft_token', token);
  setCookieToken(token, 7);
}

/** Clear the auth token from both cookie and localStorage */
export function clearToken(): void {
  localStorage.removeItem('doccraft_token');
  clearCookieToken();
}


/** Custom error class for API errors */
export class ApiRequestError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, body: ApiError) {
    const validationMessage = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail)
      ? body.detail.map(issue => {
          const field = issue.loc?.filter(part => part !== 'body').join('.');
          return issue.msg ? (field ? `${field}: ${issue.msg}` : issue.msg) : '';
        }).filter(Boolean).join('; ')
      : '';
    const errMsg = body.message || validationMessage || (typeof body.error === 'string' ? body.error : `Request failed with status ${status}`);
    super(errMsg);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = typeof body.error === 'string' ? body.error : 'API_ERROR';
    this.details = body.details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  responseType?: 'json' | 'blob';
  timeoutMs?: number;
}

/**
 * Core fetch wrapper.
 * - Automatically injects Bearer token for authenticated requests
 * - Serializes JSON bodies
 * - Parses error responses into ApiRequestError
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    auth = true,
    responseType = 'json',
    timeoutMs,
  } = options;

  const url = `${BASE_URL}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const requestToken = auth ? getToken() : null;
  if (requestToken) {
      requestHeaders['Authorization'] = `Bearer ${requestToken}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    if (response.status === 401 && auth && getToken() === requestToken) {
      clearToken();
      import('../store/authStore').then((m) => {
        if (getToken()) return; // A newer login completed during the import.
        m.useAuthStore.setState({
          user: null,
          isAuthenticated: false,
          isGuest: false,
          guestSession: null,
          isInitializing: false,
        });
      }).catch(() => {});
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !window.location.search.includes('new=true')) {
        window.location.href = `/login?expired=true`;
      }
    }
    let errorBody: ApiError;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = {
        error: 'request_failed',
        message: response.status === 401 ? 'Invalid email or password.' : `Request failed with status ${response.status}`,
      };
    }
    throw new ApiRequestError(response.status, errorBody);
  }

  if (responseType === 'blob') {
    return (await response.blob()) as unknown as T;
  }

  // Handle empty responses (204 No Content)
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

/** Shorthand for GET requests */
export function get<T>(endpoint: string, auth = true): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET', auth });
}

/** Shorthand for POST requests */
export function post<T>(endpoint: string, body?: unknown, auth = true): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'POST', body, auth });
}

/** Shorthand for PATCH requests */
export function patch<T>(endpoint: string, body?: unknown, auth = true): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'PATCH', body, auth });
}
