/** Never serialize credentials, query capabilities, request bodies or upstream errors. */
export const safeLoggerOptions={
  redact:{paths:['req.headers.authorization','req.headers.cookie','req.body','password','secret','token','accessToken','refreshToken'],censor:'[REDACTED]'},
  serializers:{
    req:request=>({id:request.id,method:request.method,url:String(request.url||'').split('?')[0],remoteAddress:request.ip}),
    err:error=>({type:error?.name||'Error',message:'Operational error',stack:'',code:typeof error?.code==='string'?error.code:undefined,statusCode:error?.statusCode}),
  },
};
