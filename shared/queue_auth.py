"""Signed queue jobs compatible with Node. Old unsigned jobs fail closed."""
import time
import uuid
import jwt
from shared.service_auth import config, key_bytes
PRODUCERS = {'document':['document'],'payment-webhook':['payment'],'email_queue_auth':['auth'],'email_queue_document':['document'],'email_queue_notification':['notification'],'analytics':['analytics']}


def signed_job(queue, name, data, job_id=None, credentials=None):
    credentials=credentials or config()
    if credentials['identity'] not in PRODUCERS[queue]:
        raise ValueError('Unauthorized queue producer')
    key=credentials['queue_send'][queue]
    job_id=job_id or str(uuid.uuid4())
    now=int(time.time())
    token=jwt.encode({'data':data,'name':name,'jobId':job_id,'iss':'doccraft-queues','sub':credentials['identity'],'aud':queue,'jti':str(uuid.uuid4()),'iat':now,'exp':now+604800},key_bytes(key['secret']),algorithm='HS256',headers={'typ':'doccraft-job+jwt','kid':key['kid']})
    return {'data':{'authorization':token},'opts':{'jobId':job_id}}


def verified_job(queue, job, credentials=None):
    credentials=credentials or config()
    token=job.data.get('authorization')
    if not isinstance(token,str): raise ValueError('Signed queue job required')
    header=jwt.get_unverified_header(token)
    hint=jwt.decode(token,options={'verify_signature':False})
    if hint.get('sub') not in PRODUCERS[queue]: raise ValueError('Unauthorized queue producer')
    secret=credentials['queue_receive'][queue][hint['sub']][header['kid']]
    payload=jwt.decode(token,key_bytes(secret),algorithms=['HS256'],issuer='doccraft-queues',audience=queue,options={'require':['sub','iat','exp','jti','data','name','jobId']})
    if header.get('typ')!='doccraft-job+jwt' or payload['name']!=job.name or payload['jobId']!=str(job.id) or payload['exp']-payload['iat']>604801 or not isinstance(payload['data'],dict): raise ValueError('Invalid queue job binding')
    return payload['data']


async def add_job(queue, queue_name, name, data, opts=None):
    envelope=signed_job(queue_name,name,data,(opts or {}).get('jobId'))
    return await queue.add(name=name,data=envelope['data'],opts={**(opts or {}),**envelope['opts']})
