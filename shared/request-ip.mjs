/** Express resolves req.ip using its explicitly configured trusted proxy list. */
export function requestIp(request){return request.ip || request.socket.remoteAddress || '';}
