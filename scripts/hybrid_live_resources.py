"""Sample task-owned processes only; report PSS to avoid shared-page double count."""
import json,os,signal,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/hybrid-ai/evidence/live/resource-samples.jsonl'
stopping=False
def stop(*args):
 global stopping;stopping=True
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
def process_table():
 table={}
 for directory in Path('/proc').iterdir():
  if not directory.name.isdigit():continue
  try:
   stat=(directory/'stat').read_text().rsplit(')',1)[1].split();cmd=(directory/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace')
   table[int(directory.name)]={'parent':int(stat[1]),'cpu_ticks':int(stat[11])+int(stat[12]),'cmd':cmd}
  except (OSError,ValueError):pass
 return table
def sample():
 ctx=json.loads((ROOT/'.local/hybrid-live/stack/context.json').read_text());table=process_table();roots=ctx['processes'].copy()
 for pid,data in table.items():
  parts=data['cmd'].split()
  if len(parts)>1 and parts[0].endswith('/tools/bin/ollama') and parts[1]=='serve':roots['ollama']=pid
 groups={}
 for name,pid in roots.items():
  members={pid};changed=True
  while changed:
   extra={p for p,d in table.items() if d['parent'] in members};changed=not extra.issubset(members);members|=extra
  total={'rss_kib':0,'pss_kib':0,'cpu_ticks':0,'read_bytes':0,'write_bytes':0,'processes':0}
  for member in members:
   try:
    mem={l.split(':')[0]:int(l.split()[1]) for l in Path(f'/proc/{member}/smaps_rollup').read_text().splitlines()[1:] if len(l.split())>=2}
    io={l.split(':')[0]:int(l.split()[1]) for l in Path(f'/proc/{member}/io').read_text().splitlines()}
    total['rss_kib']+=mem.get('Rss',0);total['pss_kib']+=mem.get('Pss',0);total['cpu_ticks']+=table[member]['cpu_ticks'];total['read_bytes']+=io['read_bytes'];total['write_bytes']+=io['write_bytes'];total['processes']+=1
   except (OSError,KeyError,ValueError):pass
  groups[name]=total
 mem={l.split(':')[0]:int(l.split()[1]) for l in Path('/proc/meminfo').read_text().splitlines()}
 disk=os.statvfs(ROOT)
 return {'sampler_version':2,'timestamp':time.time(),'monotonic':time.monotonic(),'groups':groups,'memory_available_kib':mem['MemAvailable'],'memory_total_kib':mem['MemTotal'],'load_average':os.getloadavg(),'disk_available_bytes':disk.f_bavail*disk.f_frsize,'clock_ticks_per_second':os.sysconf('SC_CLK_TCK')}
if __name__=='__main__':
 with OUT.open('a',buffering=1) as stream:
  while not stopping:
   stream.write(json.dumps(sample())+'\n');time.sleep(2)
