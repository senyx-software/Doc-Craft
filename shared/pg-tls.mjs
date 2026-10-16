/** Keep certificate validation enabled for remote node-postgres connections. */
import {readFileSync} from 'node:fs';
export function pgConnectionOptions(connectionString,options={}){
 if(!connectionString)throw new Error('DATABASE_URL is required');
 const url=new URL(connectionString);
 const local=['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname);
 if(local&&!options.requireTls)return {connectionString};
 for(const name of ['sslmode','ssl','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(name);
 return {connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(options.caFile?{ca:readFileSync(options.caFile,'utf8')}:{})}};
}
