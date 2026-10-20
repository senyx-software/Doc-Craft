import hashlib
import json
from datetime import datetime,timezone
import uuid
from fastapi import HTTPException
from app.db.admin_db import admin_db
from shared.safe_template import validate_template

import os
if os.getenv('ADMIN_RUN_MIGRATIONS','true')=='true':
    admin_db.execute('''CREATE TABLE IF NOT EXISTS uploaded_template_versions (
     id TEXT PRIMARY KEY, family_id TEXT NOT NULL, version INTEGER NOT NULL,
     owner_id TEXT NOT NULL, visibility TEXT NOT NULL, name TEXT NOT NULL,
     document_type TEXT NOT NULL, premium INTEGER NOT NULL, source_json TEXT NOT NULL,
     digest TEXT NOT NULL, uploaded_by TEXT NOT NULL, reviewed_by TEXT, approved_at TEXT,
     created_at TEXT NOT NULL, UNIQUE(family_id,version))''')
    admin_db.execute('''CREATE TABLE IF NOT EXISTS uploaded_template_publications (
     family_id TEXT PRIMARY KEY, version_id TEXT, updated_at TEXT NOT NULL)''')


def version(identity):
    row=admin_db.fetch_one('SELECT * FROM uploaded_template_versions WHERE id=?',(identity,))
    if not row:raise HTTPException(404,'Uploaded template version not found')
    return row


def descriptor(row):
    return {'id':row['id'],'family_id':row['family_id'],'version':row['version'],'name':row['name'],
        'type':row['document_type'],'documentTypes':[row['document_type']],'variant':row['id'],
        'schema':{},'slots':[],'premium':bool(row['premium']),'owner_id':row['owner_id'],'visibility':row['visibility'],
        'approved':bool(row['approved_at']),'review_status':'approved' if row['approved_at'] else 'rejected' if row.get('reviewed_by') else 'pending','digest':row['digest'],
        'created_at':row.get('created_at')}


def create(data,actor):
    try:source=validate_template(data.html,data.assets)
    except ValueError as error:raise HTTPException(422,'Template rejected: '+str(error)) from error
    except Exception as error:raise HTTPException(422,'Template rejected: unsupported HTML, placeholders, or assets') from error
    family=data.family_id or 'upl_'+uuid.uuid4().hex
    previous=admin_db.fetch_one('SELECT * FROM uploaded_template_versions WHERE family_id=? ORDER BY version DESC LIMIT 1',(family,)) if data.family_id else None
    if data.family_id and not previous:raise HTTPException(404,'Template family not found')
    if previous and (previous['owner_id']!=data.owner_id or previous['document_type']!=data.document_type):raise HTTPException(409,'Version owner and document type are immutable')
    number=previous['version']+1 if previous else 1
    identity=family+'_v'+str(number)
    # Source is immutable; publication is a separately reviewed pointer.
    encoded=json.dumps({'html':source['html'],'assets':source['assets']},sort_keys=True,separators=(',',':'))
    digest=hashlib.sha256(encoded.encode()).hexdigest()
    created_at=datetime.now(timezone.utc).isoformat()
    try:
        admin_db.execute('''INSERT INTO uploaded_template_versions(id,family_id,version,owner_id,visibility,name,document_type,premium,source_json,digest,uploaded_by,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',(identity,family,number,data.owner_id,data.visibility,data.name,data.document_type,int(data.premium),encoded,digest,actor,created_at))
    except Exception as error:raise HTTPException(409,'Concurrent version update; reload and retry') from error
    return descriptor({'id':identity,'family_id':family,'version':number,'name':data.name,
        'document_type':data.document_type,'premium':data.premium,'owner_id':data.owner_id,
        'visibility':data.visibility,'approved_at':None,'digest':digest,'created_at':created_at})


def rename(identity,name,owner_id=None):
    row=version(identity)
    if owner_id is not None and row['owner_id']!=owner_id:
        raise HTTPException(404,'Uploaded template version not found')
    # Names are metadata. Renaming does not change reviewed source or publication.
    admin_db.execute('UPDATE uploaded_template_versions SET name=? WHERE id=?',(name,identity))
    return descriptor({**row,'name':name})


def available(user_id):
    rows=admin_db.fetch_all('''SELECT v.* FROM uploaded_template_versions v JOIN uploaded_template_publications p ON p.version_id=v.id
        WHERE v.approved_at IS NOT NULL AND (v.visibility='public' OR v.owner_id=?)''',(user_id,))
    return [descriptor(row) for row in rows]


def content(identity,user_id):
    row=version(identity)
    publication=admin_db.fetch_one('SELECT version_id FROM uploaded_template_publications WHERE family_id=?',(row['family_id'],))
    if not publication or publication['version_id']!=identity or not row['approved_at'] or row['visibility']!='public' and row['owner_id']!=user_id:raise HTTPException(404,'Template unavailable')
    if hashlib.sha256(row['source_json'].encode()).hexdigest()!=row['digest']:raise HTTPException(503,'Template integrity check failed')
    return {**descriptor(row),'source':json.loads(row['source_json'])}


def publish(identity):
    row=version(identity)
    if not row['approved_at']:raise HTTPException(409,'Administrator review is required before publication')
    admin_db.execute('''INSERT INTO uploaded_template_publications(family_id,version_id,updated_at) VALUES(?,?,?)
        ON CONFLICT(family_id) DO UPDATE SET version_id=excluded.version_id,updated_at=excluded.updated_at''',(row['family_id'],identity,datetime.now(timezone.utc).isoformat()))
    return descriptor(row)


def review(identity, reviewer, decision, visibility, expected_digest):
    """Review the inspected source and atomically set its audience/publication."""
    connection=admin_db.get_connection()
    try:
        cursor=connection.cursor()
        if not admin_db.is_postgres:cursor.execute('BEGIN IMMEDIATE')
        query='SELECT * FROM uploaded_template_versions WHERE id=?'+(' FOR UPDATE' if admin_db.is_postgres else '')
        cursor.execute(admin_db._convert_query(query),(identity,))
        raw=cursor.fetchone()
        if not raw:raise HTTPException(404,'Uploaded template version not found')
        row=dict(zip([column[0] for column in cursor.description],raw))
        if row['digest']!=expected_digest:raise HTTPException(409,'Template changed; open its preview again before reviewing')
        if hashlib.sha256(row['source_json'].encode()).hexdigest()!=row['digest']:raise HTTPException(503,'Template integrity check failed')
        now=datetime.now(timezone.utc).isoformat()
        audience=visibility if decision=='approve' else row['visibility']
        approved_at=now if decision=='approve' else None
        cursor.execute(admin_db._convert_query('UPDATE uploaded_template_versions SET reviewed_by=?,approved_at=?,visibility=? WHERE id=?'),(reviewer,approved_at,audience,identity))
        if decision=='approve':
            cursor.execute(admin_db._convert_query('''INSERT INTO uploaded_template_publications(family_id,version_id,updated_at) VALUES(?,?,?)
                ON CONFLICT(family_id) DO UPDATE SET version_id=excluded.version_id,updated_at=excluded.updated_at'''),(row['family_id'],identity,now))
        else:
            cursor.execute(admin_db._convert_query('UPDATE uploaded_template_publications SET version_id=NULL,updated_at=? WHERE family_id=? AND version_id=?'),(now,row['family_id'],identity))
        connection.commit()
        return descriptor({**row,'reviewed_by':reviewer,'approved_at':approved_at,'visibility':audience})
    except BaseException:
        connection.rollback()
        raise
    finally:
        admin_db._release_connection(connection)
