-- Claims are bound to this Redis process generation. After replay-store loss,
-- credentials issued before recovery (including 3s accepted clock skew) cannot
-- become valid again. INFO and SET execute atomically under the service ACL.
local info = redis.call('INFO', 'server')
local uptime = tonumber(string.match(info, 'uptime_in_seconds:(%d+)'))
local micros = tonumber(string.match(info, 'server_time_usec:(%d+)'))
local issued = tonumber(ARGV[2])
if not uptime or not micros or not issued or issued <= math.floor(micros/1000000)-uptime+3 then return -1 end
local claimed = redis.call('SET', KEYS[1], '1', 'EX', ARGV[1], 'NX')
if claimed then return 1 end
return 0
