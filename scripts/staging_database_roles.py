"""Provision new, scoped runtime roles only in a task-owned staging database.

Run with STAGING_MIGRATION_DATABASE_URL and --output after migrations. Never
reuse a production database or role. Passwords are written only to private files.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
from urllib.parse import urlsplit,urlunsplit,quote,urlencode
import psycopg2
from psycopg2 import sql

OWNED={
 'auth':{'users','sessions','password_resets','login_events','referrals','access_revocations'},
 'chat':{'document_types','guest_migrations','templates','chat_sessions','chat_messages','generated_documents','tool_executions','ai_usages'},
 'payment':{'plans','subscriptions','billing_invoices','coupons','webhook_events','webhook_deliveries','checkout_intents','payment_outbox','payment_provider_cursors','billing_adjustments'},
 'quota':{'quotas','quota_reset_logs','quota_audit_logs','quota_reservations','quota_daily_usage','quota_windows'},
 'document':{'documents','custom_templates'},
 'notification':{'NotificationLog','NotificationPreference','NotificationDelivery'},
 'analytics':set(),'admin-api':set(),
}
READABLE={
 'admin-api':{'users','login_events','referrals','chat_sessions','chat_messages','templates','document_types','generated_documents','tool_executions','ai_usages','documents','custom_templates','subscriptions','billing_invoices','quotas','quota_windows','NotificationLog','NotificationPreference'},
 'analytics':{'users','chat_sessions','chat_messages','generated_documents','tool_executions','ai_usages','documents','subscriptions','billing_invoices'},
}

def provision(connection,prefix,*,expected_database=None,credentials=None):
    if not prefix.replace('_','').isalnum():raise ValueError('Invalid staging role prefix')
    result={}
    with connection.cursor() as cursor:
        cursor.execute('SELECT current_database()');database=cursor.fetchone()[0]
        if expected_database is None:
            if not database.startswith(('doccraft_staging_','doccraft_phase4_')):raise ValueError('Refusing a database outside the staging/task namespace')
        elif database != expected_database or not credentials or set(credentials)!=set(OWNED):
            raise ValueError('Explicit database and complete persistent runtime credentials required')
        cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'");tables={row[0] for row in cursor.fetchall()}
        known=set().union(*OWNED.values())
        admin_tables=tables-known-{'_prisma_migrations'}
        # Explicit known admin tables; unknown tables fail review rather than receiving a wildcard grant.
        admin_tables={name for name in admin_tables if name in {'ai_credentials','ai_model_health','ai_inference_ledger','ai_inference_queue','active_sessions','bot_detection_logs','rate_limit_violations','account_abuse_reports','refund_requests','contact_submissions','plan_override_requests','system_announcements'} or name.startswith(('admin_','uploaded_template_','entitlement_','config_','verification_','automation_','security_','staff_','support_','notification_','promotion_','referral_','cost_','gdpr_','report_','user_quota_','coupon_','ip_','login_','role_','permission_'))}
        cursor.execute('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
        cursor.execute('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC')
        for service,owned in OWNED.items():
            role=prefix+'_'+service.replace('-','_');password=credentials[service]['password'] if credentials else secrets.token_urlsafe(36)
            if len(password)<32:raise ValueError('Runtime credential is too short')
            cursor.execute('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=%s',(role,));existing=cursor.fetchone()
            if existing:
                if not credentials or any(existing):raise ValueError('Existing runtime role is not approved or has elevated privileges')
            else:cursor.execute(sql.SQL('CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %s').format(sql.Identifier(role)),(password,))
            cursor.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO {}').format(sql.Identifier(database),sql.Identifier(role)))
            cursor.execute(sql.SQL('GRANT USAGE ON SCHEMA public TO {}').format(sql.Identifier(role)))
            selected=(owned if service!='admin-api' else admin_tables)&tables
            for table in sorted(selected):
                privileges='SELECT,INSERT' if table in {'admin_audit_logs','quota_audit_logs','config_history','webhook_events'} else 'SELECT,INSERT,UPDATE,DELETE'
                cursor.execute(sql.SQL('GRANT '+privileges+' ON TABLE {} TO {}').format(sql.Identifier(table),sql.Identifier(role)))
            for table in sorted(READABLE.get(service,set())&tables):
                if table=='users':
                    safe_columns=['id','plan','status','userClass','isGuest','authProvider','createdAt']
                    if service=='admin-api':safe_columns+=['email','fullName','lastLoginAt']
                    cursor.execute(sql.SQL('GRANT SELECT ({}) ON TABLE {} TO {}').format(sql.SQL(',').join(map(sql.Identifier,safe_columns)),sql.Identifier(table),sql.Identifier(role)))
                else:cursor.execute(sql.SQL('GRANT SELECT ON TABLE {} TO {}').format(sql.Identifier(table),sql.Identifier(role)))
            cursor.execute(sql.SQL('ALTER ROLE {} SET statement_timeout=%s').format(sql.Identifier(role)),('15000',))
            result[service]={'role':role,'password':password,'write_tables':sorted(selected),'read_tables':sorted(READABLE.get(service,set())&tables)}
    connection.commit()
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    url=os.environ['STAGING_MIGRATION_DATABASE_URL'];parsed=urlsplit(url)
    with psycopg2.connect(url) as connection:roles=provision(connection,'dc_stage_'+secrets.token_hex(3))
    args.output.mkdir(mode=0o700,parents=True,exist_ok=True)
    for service,record in roles.items():
        netloc=quote(record['role'],safe='')+':'+quote(record['password'],safe='')+'@'+parsed.hostname+(':'+str(parsed.port) if parsed.port else '')
        query=parsed.query
        if service in ('auth','chat','payment','quota') and query:
            query=urlencode({'sslmode':'require','sslaccept':'strict','sslcert':os.getenv('PGSSLROOTCERT','/run/secrets/ca.crt')})
        runtime=urlunsplit((parsed.scheme,netloc,parsed.path,query,''))
        path=args.output/(service+'-database.env')
        with open(path,'x',opener=lambda path,flags:os.open(path,flags,0o600)) as file:file.write('DATABASE_URL='+runtime+'\nDIRECT_URL='+runtime+'\n')
    print('Created new scoped staging roles and private connection files. No credentials printed.')

if __name__=='__main__':main()
