export const DEFAULT_AUTH_DESTINATION = '/builder?type=invoice';

/** Keep document choices and drafts when moving through the sign-in screens. */
export function postAuthDestination(state: unknown): string {
  const from = (state as { from?: { pathname?: unknown; search?: unknown; hash?: unknown } } | null)?.from;
  if (typeof from?.pathname !== 'string' || !/^\/(?!\/)/.test(from.pathname) ||
      /[\\?#]/.test(from.pathname) || /^\/(?:login|register|verify-email|oauth-callback)(?:\/|$)/.test(from.pathname)) {
    return DEFAULT_AUTH_DESTINATION;
  }

  let search = typeof from.search === 'string' && from.search.startsWith('?') ? from.search : '';
  const hash = typeof from.hash === 'string' && from.hash.startsWith('#') ? from.hash : '';
  if (from.pathname === '/builder') {
    const params = new URLSearchParams(search);
    if (!params.has('type') && !params.has('sessionId') && !params.has('id')) {
      search += `${search ? '&' : '?'}type=invoice`;
    }
  }
  return from.pathname + search + hash;
}
