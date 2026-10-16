/** Redact credentials before recording notification metadata. */
const sensitive=/^(?:token|code|password|temp_password|temporary_password|verification_code|reset_token|access[_-]?token|refresh[_-]?token|authorization|cookie|api[_-]?key|secret|totp_secret|documentUrl|invite_link)$/i;
export function redact(value){
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sensitive.test(key)?'[REDACTED]':redact(item)]));
 if(typeof value==='string')return value.replace(/([?&#](?:token|signature|secret|code|key)=)[^&#\s]+/gi,'$1[REDACTED]').replace(/Bearer\s+[A-Za-z0-9._~-]+/gi,'Bearer [REDACTED]');
 return value;
}
