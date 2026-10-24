import sys,json
from pathlib import Path
sys.path.insert(0,'.local/production-audit');from audit_client import Live
l=Live();out={'scope':'Actual fresh native PostgreSQL catalog and referential checks; no production data','tables':[]}
tables=l.query("SELECT tablename,tableowner FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
from psycopg2 import sql
for name,owner in tables:
 cols=l.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position",(name,));constraints=l.query("SELECT conname,contype,convalidated,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=%s::regclass",('"'+name+'"',));indexes=l.query('SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=%s AND tablename=%s',('public',name));out['tables'].append({'name':name,'owner':owner,'columns':[{'name':c,'type':t,'nullable':n} for c,t,n in cols],'constraints':[{'name':n,'type':t,'validated':v,'definition':d} for n,t,v,d in constraints],'indexes':[{'name':n,'definition':d} for n,d in indexes]})
checks=[]
for table,col,referenced in [('documents','userId','users'),('custom_templates','userId','users'),('chat_sessions','userId','users'),('sessions','userId','users'),('subscriptions','userId','users')]:
 try:count=l.query(sql.SQL('SELECT COUNT(*) FROM {} a LEFT JOIN {} b ON a.{}=b.id WHERE b.id IS NULL').format(sql.Identifier(table),sql.Identifier(referenced),sql.Identifier(col)))[0][0];checks.append({'table':table,'reference':referenced,'orphans':count,'status':'PASS' if count==0 else 'FAIL'})
 except Exception as e:checks.append({'table':table,'status':'BLOCKED','reason':type(e).__name__})
out['logical_owner_checks']=checks;out['table_count']=len(tables);out['foreign_key_count']=sum(c['type']=='f' for t in out['tables'] for c in t['constraints']);out['all_declared_constraints_validated']=all(c['validated'] for t in out['tables'] for c in t['constraints']);Path('docs/production-audit/evidence/runtime/database-catalog.json').write_text(json.dumps(out,indent=2)+'\n');print(out['table_count'],out['foreign_key_count'],checks)
