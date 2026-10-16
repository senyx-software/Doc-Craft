import asyncio
import os
from fastapi.responses import JSONResponse
from redis.asyncio import Redis

async def dependency_readiness(database):
    redis=Redis.from_url(os.environ['REDIS_URL'],socket_connect_timeout=1.5,socket_timeout=1.5)
    try:
        await asyncio.wait_for(asyncio.gather(asyncio.to_thread(database),redis.ping()),timeout=3)
        return JSONResponse({'status':'ready'})
    except Exception:return JSONResponse({'status':'unavailable'},status_code=503)
    finally:await redis.aclose()
