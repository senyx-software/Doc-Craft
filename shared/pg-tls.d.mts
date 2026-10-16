export function pgConnectionOptions(connectionString:string|undefined,options?:{requireTls?:boolean;caFile?:string}):{connectionString:string;ssl?:{rejectUnauthorized:true;ca?:string}};
