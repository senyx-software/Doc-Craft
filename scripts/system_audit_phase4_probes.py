"""Additional checks using the running isolated stack, never external providers."""
from datetime import datetime, timedelta, timezone
import concurrent.futures
import uuid
import psycopg2


def run_probes(context):
    request=context['request']; record=context['record']; users=context['users']; tokens=context['tokens']
    admin=context['admin_token']; action=context['action_headers']; internal=context['internal']; database_url=context['database_url']
    run_auth_budget_probe(context)
    run_payment_probes(context)
    run_template_probes(context)
    policy_path='/api/v1/users/'+users[1]+'/entitlements'
    for plan,limit in [('free',20),('pro',10),('max',25)]:
        request('PUT','admin',policy_path,admin,payload={'plan':plan,'features':{},'reason':'Isolated Phase 4 regression'},headers=action())
        policy=request('GET','admin',policy_path,admin)
        effective=policy.get('entitlements',policy)
        billing=request('GET','gateway','/v1/payment/subscription',tokens[1])
        detail=request('GET','admin','/api/v1/users/'+users[1],admin)
        record('User billing and administrator UI receive the same '+plan+' decision',billing['plan']==detail['plan']==effective['plan']==plan,category='Entitlements')
        quota=request('GET','gateway','/v1/quota/me',tokens[1])
        record('Authoritative '+plan+' override reaches Quota',quota['limit']==limit,{'limit':quota['limit']},'Entitlements')
    request('PUT','admin',policy_path,admin,payload={'plan':'max','features':{},'expires_at':(datetime.now(timezone.utc)+timedelta(seconds=60)).isoformat(),'reason':'Expired override recovery'},headers=action())
    with psycopg2.connect(database_url) as db:
        with db.cursor() as cur:
            cur.execute('UPDATE entitlement_overrides SET expires_at=%s WHERE user_id=%s',((datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat(),users[1]))
    quota=request('GET','gateway','/v1/quota/me',tokens[1])
    record('Expired admin override restores baseline without cache delay',quota['limit']==20,category='Entitlements')
    request('DELETE','admin',policy_path,admin,headers=action())
    # Real PostgreSQL serialization, shared allowance and receipts survive cache deletion.
    request('POST','quota','/v1/quota/reset',payload={'userId':users[1]},headers=internal)
    reservation='p4-'+uuid.uuid4().hex
    def reserve(_):
        return request('POST','quota','/v1/quota/check',payload={'userId':users[1],'plan':'max','reservationId':reservation},headers=internal)
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results=list(pool.map(reserve,range(24)))
    status=request('GET','gateway','/v1/quota/me',tokens[1])
    record('Concurrent real-database duplicate reservations consume one unit',all(x['allowed'] for x in results) and status['used']==1,category='Quota recovery')
    import redis
    cache=redis.Redis.from_url(context['redis_urls']['quota'])
    cache.delete('quota:user:'+users[1]);cache.close()
    status=request('GET','gateway','/v1/quota/me',tokens[1])
    record('Redis quota cache loss restores durable count',status['used']==1,category='Quota recovery')
    # A started window retains its boundary across UTC midnight and plan changes.
    with psycopg2.connect(database_url) as db:
        with db.cursor() as cur:
            cur.execute('SELECT "endsAt"-"startsAt" FROM "quota_windows" WHERE "userId"=%s',(users[1],))
            duration=cur.fetchone()[0]
    record('First metered request starts exactly twenty-hour account window',duration.total_seconds()==20*3600,category='Quota recovery')
    def refund(_):return request('POST','quota','/v1/quota/refund',payload={'userId':users[1],'plan':'max','reservationId':reservation},headers=internal)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(refund,range(16)))
    status=request('GET','gateway','/v1/quota/me',tokens[1])
    record('Concurrent duplicate refunds restore exactly one unit',status['used']==0,category='Quota recovery')
    # Expire the old window and ensure a delayed refund cannot reduce new usage.
    old=reservation
    # Previous receipt was refunded already; create a second active receipt first.
    old='p4-old-'+uuid.uuid4().hex
    request('POST','quota','/v1/quota/check',payload={'userId':users[1],'plan':'max','reservationId':old},headers=internal)
    with psycopg2.connect(database_url) as db:
        with db.cursor() as cur:cur.execute('UPDATE quota_windows SET "endsAt"=CURRENT_TIMESTAMP-INTERVAL %s WHERE "userId"=%s',('1 second',users[1]))
    request('POST','quota','/v1/quota/check',payload={'userId':users[1],'plan':'max','reservationId':'p4-new-'+uuid.uuid4().hex},headers=internal)
    request('POST','quota','/v1/quota/refund',payload={'userId':users[1],'plan':'max','reservationId':old},headers=internal)
    status=request('GET','gateway','/v1/quota/me',tokens[1])
    record('Delayed refund from an expired window cannot reduce current allowance usage',status['used']==1,category='Quota recovery')
    request('PUT','admin',policy_path,admin,payload={'plan':'free','features':{'daily_quota':0},'reason':'Downgrade must retain current usage'},headers=action())
    request('POST','quota','/v1/quota/check',expected=403,payload={'userId':users[1],'plan':'max','reservationId':'p4-denied-'+uuid.uuid4().hex},headers=internal)
    status=request('GET','gateway','/v1/quota/me',tokens[1])
    record('Direct service cannot use a forged Max claim to bypass a zero allowance or erase usage on downgrade',status['used']==1 and status['limit']==0,category='Entitlements')
    request('DELETE','admin',policy_path,admin,headers=action())
    request('POST','quota','/v1/quota/reset',payload={'userId':users[1]},headers=internal)


def run_role_probes(context):
    """Prove privileges and restart actual services with those runtime credentials."""
    from staging_database_roles import provision
    from urllib.parse import urlsplit,urlunsplit,quote,parse_qs,urlencode
    import os,signal,time
    with psycopg2.connect(context['database_url']) as db:
        roles=provision(db,'p4_'+uuid.uuid4().hex[:8])
    parsed=urlsplit(context['database_url'])
    for service,role in roles.items():
        authority=quote(role['role'],safe='')+':'+quote(role['password'],safe='')+'@'+parsed.hostname+':'+str(parsed.port)
        url=urlunsplit((parsed.scheme,authority,parsed.path,parsed.query,''))
        ca=parse_qs(parsed.query).get('sslrootcert',[None])[0]
        context['runtime_urls'][service]=urlunsplit((parsed.scheme,authority,parsed.path,urlencode({'sslmode':'require','sslaccept':'strict','sslcert':ca}),'')) if ca and service in ('auth','chat','payment','quota') else url
        with psycopg2.connect(url) as connection:
            connection.autocommit=True
            with connection.cursor() as cursor:
                try:cursor.execute('CREATE TABLE phase4_forbidden_role_probe(id INT)');denied=False
                except psycopg2.errors.InsufficientPrivilege:
                    connection.rollback();denied=True
                context['record'](service+' runtime role cannot create tables',denied,category='Database privileges')
                if service!='auth':
                    try:cursor.execute('UPDATE users SET "fullName"="fullName" WHERE false');denied=False
                    except psycopg2.errors.InsufficientPrivilege:
                        connection.rollback();denied=True
                    context['record'](service+' runtime role cannot mutate Auth identities',denied,category='Database privileges')
                    try:cursor.execute('SELECT "passwordHash","totpSecret" FROM users LIMIT 0');denied=False
                    except psycopg2.errors.InsufficientPrivilege:
                        connection.rollback();denied=True
                    context['record'](service+' runtime role cannot read Auth credentials',denied,category='Database privileges')
    names=('auth','quota','chat','payment','notification','admin','analytics','document')
    for name in names:
        process=next(process for label,process in reversed(context['processes']) if label==name)
        print('Draining '+name,flush=True)
        os.killpg(process.pid,signal.SIGTERM)
        try:process.wait(timeout=45)
        except Exception as error:
            os.kill(process.pid,signal.SIGUSR2);time.sleep(.2)
            raise RuntimeError(name+' failed graceful shutdown') from error
    for name in names:
        command,directory=context['launch_specs'][name];context['launch'](name,command,directory)
    for name in names:
        context['wait_service'](name)
        response=context['client'].get(context['urls'][name]+'/ready')
        context['record'](name+' restarts with restricted runtime database role',response.status_code==200,{'readiness':response.status_code},'Database privileges')
    context['request']('GET','gateway','/v1/auth/me',context['tokens'][0])
    context['request']('GET','gateway','/v1/quota/me',context['tokens'][0])
    context['record']('Authenticated workflow survives restricted-role restart',True,category='Database privileges')
    run_scoped_purge_probe(context)


def run_payment_probes(context):
    import subprocess,os,json
    identity='p4-transaction-'+uuid.uuid4().hex
    with psycopg2.connect(context['database_url']) as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT id FROM plans WHERE name=%s',('free',));plan=cursor.fetchone()[0]
            cursor.execute('INSERT INTO webhook_deliveries(id,name,payload) VALUES(%s,%s,%s)',(identity,'phase4-probe','{}'))
    environment={**context['env'],'REDIS_URL':context['redis_urls']['payment'],'SERVICE_AUTH_CONFIG_JSON':json.dumps(context['credentials']['payment'])}
    script=context['ROOT']/'scripts/system_audit_phase4_payment.mts' if 'ROOT' in context else __import__('pathlib').Path(__file__).resolve().parent/'system_audit_phase4_payment.mts'
    def run(mode):return subprocess.run([str(context['TSX']) if 'TSX' in context else str(script.parents[1]/'node_modules/.bin/tsx'),str(script),mode,identity,context['users'][0],plan],cwd=script.parents[1],env=environment,capture_output=True,text=True,timeout=40)
    crash=run('crash')
    import re
    (context['OUT']/'payment-transaction-probe.log').write_text(re.sub(r'postgres(?:ql)?://[^\s]+','[TASK_DATABASE]',crash.stdout+crash.stderr))
    with psycopg2.connect(context['database_url']) as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT count(*) FROM checkout_intents WHERE "orderId"=%s',(identity,));writes=cursor.fetchone()[0]
            cursor.execute('SELECT count(*) FROM webhook_events WHERE "eventId"=%s',(identity,));claims=cursor.fetchone()[0]
            cursor.execute('SELECT count(*) FROM payment_outbox WHERE id LIKE %s',(identity+'%',));effects=cursor.fetchone()[0]
    context['record']('Actual worker death rolls back payment business writes, event claim and outbox together',crash.returncode==73 and writes==claims==effects==0,{'exit':crash.returncode,'business_rows':writes,'claims':claims,'effects':effects},'Payment recovery')
    retry=run('retry')
    with psycopg2.connect(context['database_url']) as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT count(*) FROM checkout_intents WHERE "orderId"=%s',(identity,));writes=cursor.fetchone()[0]
            cursor.execute('SELECT count(*) FROM webhook_events WHERE "eventId"=%s',(identity,));claims=cursor.fetchone()[0]
            cursor.execute('SELECT count(*) FROM payment_outbox WHERE id LIKE %s',(identity+'%',));effects=cursor.fetchone()[0]
            cursor.execute('SELECT "completedAt" IS NOT NULL FROM webhook_deliveries WHERE id=%s',(identity,));completed=cursor.fetchone()[0]
            cursor.execute('DELETE FROM payment_outbox WHERE id LIKE %s',(identity+'%',))
    context['record']('Twelve concurrent payment replays after worker death commit one claim and one durable outbox effect',retry.returncode==0 and writes==claims==effects==1 and completed,{'exit':retry.returncode,'business_rows':writes,'claims':claims,'effects':effects},'Payment recovery')


def run_template_probes(context):
    request=context['request'];record=context['record'];admin=context['admin_token'];action=context['action_headers'];tokens=context['tokens'];users=context['users']
    payload={'name':'Isolated private company template','document_type':'invoice','html':'<div><h1>{{businessName}}</h1>{{lineItems}}</div>','assets':{}}
    item=request('POST','gateway','/v1/document/templates/uploads',tokens[0],expected=201,payload=payload)
    identity=item['id']
    catalog=request('GET','gateway','/v1/document/templates',tokens[0])['templates']
    record('Uploaded company template remains unavailable before review',all(row['id']!=identity for row in catalog),category='Templates')
    request('POST','admin','/api/v1/admin/templates/'+identity+'/publish',admin,expected=409,headers=action())
    request('POST','admin','/api/v1/admin/templates/uploads/'+identity+'/approve',admin,headers=action())
    request('POST','admin','/api/v1/admin/templates/'+identity+'/publish',admin,headers=action())
    owner=request('GET','gateway','/v1/document/templates',tokens[0])['templates'];other=request('GET','gateway','/v1/document/templates',tokens[1])['templates']
    record('Reviewed owner-only template is available only to the uploaded account',any(row['id']==identity for row in owner) and all(row['id']!=identity for row in other),category='Templates')
    preview=request('POST','gateway','/v1/document/template-preview',tokens[0],payload={'templateId':identity,'slots':{'businessName':'<script>private()</script>'}})
    request('POST','gateway','/v1/document/template-preview',tokens[1],expected=404,payload={'templateId':identity,'slots':{}})
    record('Owner-scoped uploaded rendering escapes document input and denies direct preview IDOR','&lt;script&gt;' in preview['html'] and 'default-src' in preview['html'],category='Templates')
    request('POST','gateway','/v1/document/templates/uploads',tokens[0],expected=422,payload={**payload,'html':'<img src="http://169.254.169.254/">'})
    second=request('POST','admin','/api/v1/admin/templates/uploads',admin,expected=201,payload={**payload,'owner_id':users[0],'family_id':item['family_id'],'visibility':'public'},headers=action())
    request('POST','admin','/api/v1/admin/templates/uploads/'+second['id']+'/approve',admin,headers=action())
    request('POST','admin','/api/v1/admin/templates/'+second['id']+'/publish',admin,headers=action())
    public=request('GET','gateway','/v1/document/templates',tokens[1])['templates']
    record('Administrator can publish an immutable new version publicly',any(row['id']==second['id'] for row in public),category='Templates')
    request('POST','admin','/api/v1/admin/templates/'+identity+'/publish',admin,headers=action())
    public=request('GET','gateway','/v1/document/templates',tokens[1])['templates']
    record('Template rollback restores the private version and removes public availability',all(row['id'] not in (identity,second['id']) for row in public),category='Templates')
    request('POST','admin','/api/v1/admin/templates/'+identity+'/withdraw',admin,headers=action())


def run_scoped_purge_probe(context):
    """Existing administrator soft-purge workflow using only service-owned writes."""
    request=context['request'];env=context['env'];database=context['database_url'];email=env['SUPER_ADMIN_EMAIL']
    request('POST','admin','/api/v1/admin/auth/login',payload={'email':email,'password':env['SUPER_ADMIN_PASSWORD']})
    with psycopg2.connect(database) as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT code FROM verification_codes WHERE email=%s',('login:'+email,));code=cursor.fetchone()[0]
            cursor.execute('SELECT email FROM users WHERE id=%s',(context['users'][1],));target=cursor.fetchone()[0]
    token=request('POST','admin','/api/v1/admin/auth/verify-login-code',payload={'email':email,'verification_code':code})['access_token']
    def headers():
        request('POST','admin','/api/v1/admin/auth/request-action-code',token,payload={})
        with psycopg2.connect(database) as db:
            with db.cursor() as cursor:
                cursor.execute('SELECT code FROM verification_codes WHERE email=%s',('action:'+email,));return {'X-Admin-2FA':cursor.fetchone()[0]}
    result=request('POST','admin','/api/v1/admin/gdpr/purge',token,payload={'email':target},headers=headers())
    replay=request('POST','admin','/api/v1/admin/gdpr/purge',token,payload={'email':target},headers=headers())
    with psycopg2.connect(database) as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT status,"passwordHash","totpSecret",email FROM users WHERE id=%s',(context['users'][1],));row=cursor.fetchone()
    context['record']('Administrator soft-purge and retry work with scoped roles and Auth-owned credential invalidation',row[0]=='deleted' and row[1] is row[2] is None and result==replay and row[3]!=target,category='Database privileges')
    context['admin_token']=token;context['action_headers']=headers


def run_auth_budget_probe(context):
    identity=str(uuid.uuid4());email='phase4-login-budget-'+uuid.uuid4().hex+'@example.com'
    with psycopg2.connect(context['database_url']) as db:
        with db.cursor() as cursor:
            cursor.execute('INSERT INTO users(id,email,"passwordHash","emailVerified","updatedAt") SELECT %s,%s,"passwordHash",true,CURRENT_TIMESTAMP FROM users WHERE id=%s',(identity,email,context['users'][0]))
    def fail(_):
        response=context['client'].post(context['urls']['auth']+'/v1/auth/login',json={'email':email,'password':'Incorrect synthetic password'})
        return response.status_code
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:statuses=list(pool.map(fail,range(5)))
    with psycopg2.connect(context['database_url']) as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT "failedLoginAttempts","lockedUntil">CURRENT_TIMESTAMP FROM users WHERE id=%s',(identity,));attempts,locked=cursor.fetchone()
    again=fail(None)
    context['record']('Concurrent authentication failures atomically lock the account at five attempts',all(code==401 for code in statuses) and attempts==5 and locked and again==403,{'statuses':statuses,'attempts':attempts,'locked':locked},'Authentication abuse')


def run_redis_loss_probe(context):
    """Restart only the task-owned Redis with an empty persistence directory."""
    import os,signal,time,json
    from shared.service_auth import service_token
    request=context['request'];client=context['client'];urls=context['urls'];credentials=context['credentials'];users=context['users'];tokens=context['tokens'];record=context['record']
    def signed(receiver,service,path):
        outbound=client.build_request('GET',urls[service]+path)
        outbound.headers['X-DocCraft-Service-Token']=service_token(receiver,'GET',outbound.url,outbound.content,credentials['admin-api'])
        assert client.send(outbound).status_code==200
        return outbound
    node=signed('auth','auth','/internal/users');python=signed('analytics','analytics','/v1/analytics/overview')
    # The real intake commits before acknowledging; keep delivery disabled
    # until after an empty Redis restart, then use test transport (no email).
    admin=context['admin_token'];action=context['action_headers']
    request('PUT','admin','/api/v1/admin/notifications/settings',admin,payload={'email_provider':'disabled'},headers=action())
    notification={'userId':users[0],'email':'phase2-user-0@example.com','type':'renewal','idempotencyKey':'loss-'+uuid.uuid4().hex,'payload':{'userId':users[0],'email':'phase2-user-0@example.com'}}
    receipt=request('POST','notification','/notification/send',payload=notification,headers=context['internal'])
    record('Notification acknowledges a PostgreSQL receipt before Redis projection',receipt['status']=='durably_accepted',category='Payment recovery')
    event_id='p4-automation-loss-'+uuid.uuid4().hex
    event_payload={'user_id':users[0],'email':'phase2-user-0@example.com'}
    event='payment.failed'
    import hashlib
    fingerprint=hashlib.sha256(json.dumps({'event':event,'payload':event_payload},sort_keys=True,separators=(',',':')).encode()).hexdigest()
    now=datetime.now(timezone.utc).isoformat();later=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
    with psycopg2.connect(context['database_url']) as db:
        with db.cursor() as cursor:
            cursor.execute('INSERT INTO automation_event_inbox(id,event,payload,fingerprint,next_at,created_at) VALUES(%s,%s,%s,%s,%s,%s)',(event_id,event,json.dumps(event_payload),fingerprint,later,now))
            cursor.execute('INSERT INTO payment_outbox(id,kind,payload) VALUES(%s,%s,%s)',(event_id,'automation',json.dumps({'event':event,'payload':event_payload})))
    deadline=time.monotonic()+40
    while True:
        with psycopg2.connect(context['database_url']) as db:
            with db.cursor() as cursor:
                cursor.execute('SELECT "completedAt" FROM payment_outbox WHERE id=%s',(event_id,));ack=cursor.fetchone()[0]
        if ack or time.monotonic()>deadline:break
        time.sleep(.25)
    record('Payment outbox completes automation only after an idempotent durable Admin receipt',bool(ack),'Real dispatcher and signed HTTP; fixture defers execution until after Redis loss','Payment recovery')
    identity='p4-empty-redis-'+uuid.uuid4().hex
    request('POST','quota','/v1/quota/check',payload={'userId':users[0],'reservationId':identity},headers=context['internal'])
    before=request('GET','gateway','/v1/quota/me',tokens[0])
    process=next(process for name,process in reversed(context['processes']) if name=='redis')
    os.killpg(process.pid,signal.SIGTERM);process.wait(timeout=10)
    folder=context['scratch']/'empty-redis';folder.mkdir()
    command,directory=context['launch_specs']['redis'];command=list(command);command[command.index('--dir')+1]=folder
    context['launch']('redis',command,directory)
    deadline=time.monotonic()+20
    while True:
        try:ready=client.get(urls['auth']+'/ready').status_code==200
        except Exception:ready=False
        if ready and time.time()-os.stat(folder).st_mtime>4:break
        if time.monotonic()>deadline:raise RuntimeError('Fresh Redis did not recover')
        time.sleep(.2)
    after=request('GET','gateway','/v1/quota/me',tokens[0])
    record('Complete Redis data loss preserves the PostgreSQL allowance and existing reset boundary',after['used']==before['used'] and after['resets_at']==before['resets_at'],category='Disaster recovery')
    record('Node rejects captured service credential after replay-store data loss',client.send(node).status_code in (409,503),category='Disaster recovery')
    record('Python rejects captured service credential after replay-store data loss',client.send(python).status_code in (409,503),category='Disaster recovery')
    request('POST','quota','/v1/quota/refund',payload={'userId':users[0],'reservationId':identity},headers=context['internal'])
    record('Fresh signed requests and durable quota refunds work after empty Redis restart',True,category='Disaster recovery')
    with psycopg2.connect(context['database_url']) as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT state FROM automation_event_inbox WHERE id=%s',(event_id,));state=cursor.fetchone()[0]
            cursor.execute('UPDATE automation_event_inbox SET next_at=%s WHERE id=%s',(now,event_id))
    record('Acknowledged billing automation survives total Redis loss as pending PostgreSQL work',state=='pending',category='Payment recovery')
    request('PUT','admin','/api/v1/admin/notifications/settings',admin,payload={'email_provider':'resend'},headers=action())
    with psycopg2.connect(context['database_url']) as db:
        with db.cursor() as cursor:cursor.execute('UPDATE "NotificationDelivery" SET "nextAttemptAt"=NOW() WHERE id=%s',(receipt['deliveryId'],))
    deadline=time.monotonic()+25
    while True:
        with psycopg2.connect(context['database_url']) as db:
            with db.cursor() as cursor:
                cursor.execute('SELECT "completedAt",payload FROM "NotificationDelivery" WHERE id=%s',(receipt['deliveryId'],));completed,payload=cursor.fetchone()
        if completed or time.monotonic()>deadline:break
        time.sleep(.25)
    record('Pending billing notification reconstructs after complete Redis loss and scrubs completed payload',bool(completed) and payload=={},'Real SQL/queue/worker, NODE_ENV=test transport; no external email sent','Payment recovery')
    repeated=request('POST','notification','/notification/send',payload=notification,headers=context['internal'])
    request('POST','notification','/notification/send',expected=409,payload={**notification,'type':'cancellation'},headers=context['internal'])
    record('Completed notification receipt suppresses replay and rejects changed-payload key reuse',repeated['deliveryId']==receipt['deliveryId'] and repeated['status']=='completed',category='Payment recovery')
    deadline=time.monotonic()+25
    while True:
        with psycopg2.connect(context['database_url']) as db:
            with db.cursor() as cursor:
                cursor.execute('SELECT state FROM automation_event_inbox WHERE id=%s',(event_id,));state=cursor.fetchone()[0]
                cursor.execute('SELECT count(*) FROM automation_execution_logs WHERE payload_json LIKE %s',('%'+event_id+'%',));executions=cursor.fetchone()[0]
        if state in ('completed','review') or time.monotonic()>deadline:break
        time.sleep(.25)
    record('Recovered billing automation commits its action outcome once after Redis loss',state=='completed' and executions==1,'Real rule dispatch to durable Notification intake; test email transport only','Payment recovery')
