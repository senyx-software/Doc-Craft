// The native PDF child receives only its renderer identity and Redis account.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const env={};
for(const [key,value] of Object.entries(process.env))if(['PATH','HOME','TMPDIR','TEMP','TMP','NODE_ENV','LANG','DISPLAY','XDG_CACHE_HOME','SIDECAR_PORT','SIDECAR_HOST','PDF_MAX_CONCURRENT'].includes(key)||key.startsWith('PUPPETEER_'))env[key]=value;
const file=process.env.PDF_SERVICE_AUTH_CONFIG_FILE;
if(!file||JSON.parse(fs.readFileSync(file,'utf8')).identity!=='pdf')throw new Error('Dedicated PDF identity is required');
env.SERVICE_AUTH_CONFIG_FILE=file;
env.REDIS_URL=process.env.PDF_REDIS_URL;
if(!env.REDIS_URL)throw new Error('Dedicated PDF Redis account is required');
const development=process.argv.includes('--development');
const executable=development?path.resolve(__dirname,'../../../node_modules/.bin/tsx'):process.execPath;
const args=development?['watch',path.join(__dirname,'server.ts')]:[path.resolve(__dirname,'../dist/puppeteer/server.js')];
const child=spawn(executable,args,{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('PDF renderer could not start');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
