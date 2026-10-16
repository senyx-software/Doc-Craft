import {Redis} from 'ioredis';
export async function dependenciesReady(database) {
  const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,connectTimeout:1500,commandTimeout:1500,maxRetriesPerRequest:0,enableOfflineQueue:false});redis.on('error',()=>{});
  let timer;
  try {
    await Promise.race([Promise.all([database(),redis.connect().then(()=>redis.ping())]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Readiness timeout')),2500);})]);
    return true;
  } catch {return false;} finally {clearTimeout(timer);redis.disconnect();}
}
