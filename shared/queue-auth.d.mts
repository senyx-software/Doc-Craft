export function signedJob(queue:string,name:string,data:unknown,jobId?:string):Promise<{data:{authorization:string};opts:{jobId:string}}>;
export function verifiedJob(queue:string,job:{data:any;name:string;id?:string}):Promise<any>;
