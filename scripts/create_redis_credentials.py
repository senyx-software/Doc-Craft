"""Write private per-service Redis ACLs and client environments for Compose.

Redis ACLs restrict keys/channels, including queue ownership. They do not encrypt
traffic. Use TLS/private encrypted networking before production deployment.
"""
import argparse
import hashlib
import os
import secrets
import stat
from pathlib import Path

PATTERNS = {
 'auth': ['bull:email_queue_auth:*','auth:*'],
 'gateway':['ratelimit:*','rate_limit:*','config:domain:settings'],
 'chat':['semaphore:chat-concurrency','chat-queue-size','chat:*'],
 'document':['bull:document:*','bull:email_queue_document:*'],
 'payment':['bull:payment-webhook:*','config:domain:plans','config:domain:settings'],
 'quota':['bull:quota-reset:*','quota:*','guest:*','abuse:*','ip:*','config:domain:plans','config:domain:settings'],
 'notification':['bull:email_queue_auth:*','bull:email_queue_document:*','bull:email_queue_notification:*','notification:*'],
 'analytics':['bull:analytics:*'],
 'admin-api':['quota:plan:*','config:*','rbac:*','admin:*','bull:automation:*','automation:*'],
 'pdf':[],
}
# No admin/dangerous/global key enumeration commands. Lua obeys the same ACLs.
COMMANDS = ['ping','hello','auth','select','echo','quit','client|setname','client|setinfo',
 'get','set','setex','psetex','mget','mset','del','unlink','exists','expire','pexpire','expireat','pexpireat','ttl','pttl','type','incr','incrby','decr','decrby','getdel',
 'hget','hgetall','hset','hdel','hmget','hmset','hincrby','hexists','hlen','hkeys','hvals','hscan',
 'lpush','rpush','lpop','rpop','rpoplpush','brpoplpush','lmove','blmove','lrange','lrem','llen','lindex','ltrim','lpos',
 'zrevrangebyscore','zrank','zrevrank','zincrby','zmscore','zpopmax','bzpopmin','zadd','zrem','zrange','zrangebyscore','zrevrange','zscore','zcard','zcount','zremrangebyscore','zremrangebyrank','zpopmin',
 'sadd','srem','scard','smembers','sismember','spop',
 'xadd','xread','xtrim','xlen','xrange','xrevrange','xdel',
 'blpop','brpop','multi','exec','discard','watch','unwatch','eval','evalsha','script|load','script|exists','info',
 'subscribe','unsubscribe','psubscribe','punsubscribe','publish']


def write_private(path, text, overwrite=False):
    path = Path(path)
    if path.exists():
        if not overwrite:
            raise FileExistsError(f"{path} already exists. Use --overwrite to replace it.")
        try:
            # On Windows, ensure file is writable before unlinking/writing
            os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
        except OSError:
            pass
        try:
            path.unlink()
        except OSError:
            pass
    def opener(p, flags):
        return os.open(p, flags, 0o600)
    with open(path, "w", opener=opener) as output:
        output.write(text)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def generate(directory, host='redis', port=6379, overwrite=False):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    lines = ['user default off']
    environments = {}
    for identity, patterns in PATTERNS.items():
        password = secrets.token_urlsafe(36)
        own_patterns = [*patterns, 'service-auth:' + identity + ':*']
        channels = ['config_invalidation'] if identity == 'admin-api' else []
        if identity in ('admin-api', 'payment', 'quota'):
            channels += ['doccraft:events']
        line = f'user {identity} on #{hashlib.sha256(password.encode()).hexdigest()} resetkeys resetchannels ' + ' '.join(('%R~' if pattern.startswith('config:') and identity != 'admin-api' else '~') + pattern for pattern in own_patterns) + ' ' + ' '.join('&' + channel for channel in channels) + ' -@all ' + ' '.join('+' + command for command in COMMANDS)
        if identity in ('admin-api', 'quota'):
            line += ' +scan'
        if identity in ('gateway', 'quota', 'payment'):
            line += ' ( +subscribe +unsubscribe &config_invalidation )'
        lines.append(line)
        value = f'REDIS_URL=redis://{identity}:{password}@{host}:{port}/0\n'
        environments[identity] = value
    for identity, value in environments.items():
        write_private(directory / (identity + '.env'), value, overwrite=overwrite)
    password = secrets.token_urlsafe(36)
    lines.append(f'user health on #{hashlib.sha256(password.encode()).hexdigest()} -@all +ping')
    write_private(directory / 'redis-health.env', f'REDISCLI_AUTH={password}\n', overwrite=overwrite)
    write_private(directory / 'redis.acl', '\n'.join(lines) + '\n', overwrite=overwrite)
    return environments


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--redis-host', default='redis')
    parser.add_argument('--redis-port', type=int, default=6379)
    parser.add_argument('--overwrite', '--force', '-f', action='store_true', help='Overwrite existing credentials without error')
    args = parser.parse_args()
    generate(args.directory, args.redis_host, args.redis_port, overwrite=args.overwrite)
    print('Created private Redis ACL and per-service environments; no passwords printed.')
