import {createHash} from 'node:crypto';
/** Opaque session credentials are never stored as usable bearer tokens. */
export const tokenDigest = (token:string) => 'sha256:'+createHash('sha256').update(token).digest('hex');
