// Native development launcher. Private identities are never sent to Vite/browser processes.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const [identity,...command]=process.argv.slice(2);
if(!identity||!command.length)throw new Error('Usage: with-service-identity.cjs <identity> <command> [arguments]');
const directory=path.resolve(process.env.DOCCRAFT_SECRETS_DIR||path.join(__dirname,'../.local/secrets'));
const file=path.join(directory,identity+'.json');
const config=JSON.parse(fs.readFileSync(file,'utf8'));
if(config.identity!==identity)throw new Error('Wrong service identity file');
const redisLine=fs.readFileSync(path.join(directory,identity+'.env'),'utf8').split('\n').find(line=>line.startsWith('REDIS_URL='));
if(!redisLine)throw new Error('Missing private Redis client configuration');
const env={...process.env,SERVICE_AUTH_CONFIG_FILE:file,REDIS_URL:redisLine.slice('REDIS_URL='.length)};
delete env.SERVICE_AUTH_CONFIG_JSON;
if(identity==='document'){
 env.PDF_SERVICE_AUTH_CONFIG_FILE=path.join(directory,'pdf.json');
 const pdfLine=fs.readFileSync(path.join(directory,'pdf.env'),'utf8').split('\n').find(line=>line.startsWith('REDIS_URL='));
 if(!pdfLine)throw new Error('Missing private PDF Redis account');
 env.PDF_REDIS_URL=pdfLine.slice('REDIS_URL='.length);
}
const child=spawn(command[0],command.slice(1),{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Unable to launch configured service');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
