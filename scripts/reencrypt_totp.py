"""Dry-run/owner-approved TOTP encryption migration and key rotation.

Use a service-specific identity keyring and a private MIGRATION_DATABASE_URL.
Never prints secrets. Apply requires an approval JSON matching the target DB.
Retain all old keys until the verified row count reaches zero for those kids.
"""
import argparse,json,os,sys
from pathlib import Path
import psycopg2
from psycopg2 import sql
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--identity',choices=['auth','admin-api'],required=True);parser.add_argument('--keyring',type=Path,required=True);parser.add_argument('--account-id',help='Limit the migration to this account');parser.add_argument('--apply',action='store_true');parser.add_argument('--approval',type=Path);args=parser.parse_args()
    identity=json.loads(args.keyring.read_text())
    if identity['identity']!=args.identity:raise ValueError('Identity/keyring mismatch')
    os.environ['SERVICE_AUTH_CONFIG_JSON']=json.dumps(identity)
    from shared.sealed_secret import seal_secret,open_secret
    table='users' if args.identity=='auth' else 'admin_users';columns=['totpSecret','pendingTotpSecret'] if args.identity=='auth' else ['totp_secret']
    with psycopg2.connect(os.environ['MIGRATION_DATABASE_URL']) as db:
        with db.cursor() as cursor:
            cursor.execute('SELECT current_database()');database=cursor.fetchone()[0]
            if args.apply:
                if not args.approval:raise ValueError('Apply requires a recorded owner approval')
                approval=json.loads(args.approval.read_text())
                if approval.get('database')!=database or not all(approval.get(k) for k in ('approved_by','approved_at','change_id')):raise ValueError('Approval must identify this exact database, owner, time and change')
                if args.account_id and approval.get('account_id')!=args.account_id:raise ValueError('Approval must identify this exact account')
            query=sql.SQL('SELECT id,{} FROM {}').format(sql.SQL(',').join(map(sql.Identifier,columns)),sql.Identifier(table))
            if args.account_id:query+=sql.SQL(' WHERE id=%s')
            query+=sql.SQL(' FOR UPDATE')
            cursor.execute(query,(args.account_id,) if args.account_id else ())
            count=0
            for row in cursor.fetchall():
                for field,value in zip(columns,row[1:]):
                    if not value:continue
                    plaintext=open_secret(value,row[0]) if value.startswith('enc:') else value
                    encrypted=seal_secret(plaintext,row[0]);assert open_secret(encrypted,row[0])==plaintext
                    count+=1
                    if args.apply:cursor.execute(sql.SQL('UPDATE {} SET {}=%s WHERE id=%s').format(sql.Identifier(table),sql.Identifier(field)),(encrypted,row[0]))
            if not args.apply:db.rollback()
    print(json.dumps({'identity':args.identity,'account_id':args.account_id,'fields_verified':count,'applied':args.apply,'active_kid':identity['totp_encryption']['active_kid']}))

if __name__=='__main__':main()
