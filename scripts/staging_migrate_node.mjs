import {execFileSync} from 'node:child_process';
for(const service of ['auth','chat','payment','quota'])execFileSync('/app/node_modules/.bin/prisma',['migrate','deploy','--schema',`/app/services/${service}/prisma/schema.prisma`],{stdio:'inherit'});
process.env.NOTIFICATION_RUN_MIGRATIONS='false';
const {getDbPool,initDb}=await import('../services/notification/dist/services/db.service.js');
const pool=getDbPool();await initDb(pool);await pool.end();
