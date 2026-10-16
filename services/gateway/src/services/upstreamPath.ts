/** Translate public aliases to the prefixes actually mounted by each service. */
export function upstreamPath(originalUrl: string): string {
  const queryAt = originalUrl.indexOf('?');
  let pathname = queryAt < 0 ? originalUrl : originalUrl.slice(0, queryAt);
  const query = queryAt < 0 ? '' : originalUrl.slice(queryAt);
  const mappings: Array<[RegExp, string]> = [
    [/^\/v1\/users(?=\/|$)/, '/v1/auth'],
    [/^\/v1\/documents(?=\/|$)/, '/v1/document'],
    [/^\/v1\/templates(?=\/|$)/, '/v1/document/templates'],
    [/^\/v1\/billing(?=\/|$)/, '/v1/payment'],
    [/^\/v1\/notifications?(?=\/|$)/, '/notification'],
    [/^\/v1\/support(?=\/|$)/, '/api/v1/support'],
    [/^\/v1\/admin\/users(?=\/|$)/, '/api/v1/users'],
    [/^\/v1\/admin(?=\/|$)/, '/api/v1/admin'],
    [/^\/v1\/(?:chat|ai)\/api(?=\/|$)/, '/api'],
    [/^\/v1\/(?:chat|ai)\/(sessions?|templates)(?=\/|$)/, '/api/chat/$1'],
    [/^\/v1\/(?:chat|ai)\/mcp(?=\/|$)/, '/api/mcp'],
  ];
  for (const [pattern, replacement] of mappings) {
    if (pattern.test(pathname)) {
      pathname = pathname.replace(pattern, replacement);
      break;
    }
  }
  return pathname + query;
}
