"""Durable, deduplicated billing event intake; Redis is not its acknowledgement."""
import asyncio
from contextlib import contextmanager
from datetime import datetime,timedelta,timezone
import hashlib,json,os
from app.db.admin_db import admin_db

def initialize():
    admin_db.execute('''CREATE TABLE IF NOT EXISTS automation_event_inbox (
      id TEXT PRIMARY KEY, event TEXT NOT NULL, payload TEXT NOT NULL,
      fingerprint TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT NOT NULL,
      created_at TEXT NOT NULL, completed_at TEXT)''')

def accept(delivery_id,event,payload):
    body=json.dumps({'event':event,'payload':payload},sort_keys=True,separators=(',',':'))
    fingerprint=hashlib.sha256(body.encode()).hexdigest();now=datetime.now(timezone.utc).isoformat()
    admin_db.execute('''INSERT INTO automation_event_inbox(id,event,payload,fingerprint,next_at,created_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING''',(delivery_id,event,json.dumps(payload),fingerprint,now,now))
    row=admin_db.fetch_one('SELECT fingerprint,state FROM automation_event_inbox WHERE id=?',(delivery_id,))
    if not row or row['fingerprint']!=fingerprint:raise ValueError('Conflicting event delivery identity')
    return {'delivery_id':delivery_id,'state':row['state'],'durably_accepted':True}

@contextmanager
def consumer_lock():
    # Session locks release when a process dies. Do not hold a SQLite write
    # transaction while the existing engine writes its action logs separately.
    if admin_db.is_postgres:
        connection=admin_db.get_connection();locked=False
        try:
            cursor=connection.cursor();cursor.execute('SELECT pg_try_advisory_lock(48070002)');locked=cursor.fetchone()[0];connection.commit()
            yield locked
        finally:
            try:
                if locked:connection.cursor().execute('SELECT pg_advisory_unlock(48070002)')
                connection.commit()
            finally:admin_db._release_connection(connection)
    else:
        import fcntl
        descriptor=os.open(admin_db._db_path+'.automation-inbox.lock',os.O_CREAT|os.O_RDWR,0o600)
        try:
            try:fcntl.flock(descriptor,fcntl.LOCK_EX|fcntl.LOCK_NB);locked=True
            except BlockingIOError:locked=False
            yield locked
        finally:os.close(descriptor)

def process_batch(engine=None):
    if engine is None:
        from app.services.automation_engine import automation_engine
        engine=automation_engine
    with consumer_lock() as locked:
        if not locked:return
        rows=admin_db.fetch_all("SELECT * FROM automation_event_inbox WHERE state='pending' AND next_at<=? ORDER BY next_at,id LIMIT 10",(datetime.now(timezone.utc).isoformat(),))
        for row in rows:
            try:
                logs=engine.process_event(row['event'],{**json.loads(row['payload']),'_delivery_id':row['id']})
                failed=any(str(getattr(log.status,'value',log.status))=='dead_letter' for log in logs)
                if failed:
                    # Retain failed action outcomes for owner reconciliation;
                    # do not silently replay successful irreversible actions.
                    admin_db.execute("UPDATE automation_event_inbox SET state='review',attempts=attempts+1 WHERE id=?",(row['id'],))
                else:admin_db.execute("UPDATE automation_event_inbox SET state='completed',completed_at=?,payload='{}' WHERE id=?",(datetime.now(timezone.utc).isoformat(),row['id']))
            except Exception:
                retry=(datetime.now(timezone.utc)+timedelta(seconds=30)).isoformat()
                admin_db.execute('UPDATE automation_event_inbox SET attempts=attempts+1,next_at=? WHERE id=?',(retry,row['id']))

async def run(stop:asyncio.Event):
    while not stop.is_set():
        try:await asyncio.to_thread(process_batch)
        except Exception:pass # Durable rows remain pending; readiness/alerts monitor dependency failure.
        try:await asyncio.wait_for(stop.wait(),timeout=5)
        except asyncio.TimeoutError:pass

if os.getenv('ADMIN_RUN_MIGRATIONS','true')=='true':initialize()
