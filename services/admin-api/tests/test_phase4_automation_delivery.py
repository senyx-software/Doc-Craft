import concurrent.futures,json,time,uuid
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import automation_inbox as inbox
from app.services.automation_engine import automation_engine
from app.models.automation import ActionRule,ActionTypeEnum,ExecutionStatusEnum
from app.repositories.automation_repository import automation_repository,SEED_RULES

@pytest.fixture(autouse=True)
def cleanup():
    yield
    inbox.admin_db.execute("DELETE FROM automation_event_inbox WHERE id LIKE 'phase4-inbox-test%'")

def identity():return 'phase4-inbox-test-'+uuid.uuid4().hex

def test_durable_intake_deduplicates_concurrent_replays_and_rejects_changed_payload():
    key=identity();payload={'user_id':'fixture-owner'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        replies=list(pool.map(lambda _:inbox.accept(key,'payment.failed',payload),range(16)))
    assert all(reply['durably_accepted'] for reply in replies)
    assert inbox.admin_db.fetch_one('SELECT count(*) AS n FROM automation_event_inbox WHERE id=?',(key,))['n']==1
    with pytest.raises(ValueError):inbox.accept(key,'payment.failed',{'user_id':'different-owner'})

def test_receiver_does_not_allow_unsigned_billing_event_submission():
    response=TestClient(app).post('/api/v1/internal/automation/events',json={'delivery_id':identity(),'event':'payment.failed','payload':{}})
    assert response.status_code in (401,503)

def test_database_receipt_survives_failed_processing_and_a_new_consumer_retries():
    key=identity();inbox.accept(key,'payment.failed',{'user_id':'fixture-owner'})
    calls=[]
    def fail(event,payload):calls.append(payload);raise RuntimeError('Owned worker interrupted')
    inbox.process_batch(SimpleNamespace(process_event=fail))
    row=inbox.admin_db.fetch_one('SELECT * FROM automation_event_inbox WHERE id=?',(key,));assert row['state']=='pending' and row['attempts']==1
    inbox.admin_db.execute("UPDATE automation_event_inbox SET next_at='2000-01-01' WHERE id=?",(key,))
    inbox.process_batch(SimpleNamespace(process_event=lambda event,payload:calls.append(payload) or []))
    row=inbox.admin_db.fetch_one('SELECT * FROM automation_event_inbox WHERE id=?',(key,))
    assert row['state']=='completed' and json.loads(row['payload'])=={}
    assert calls[0]['_delivery_id']==calls[1]['_delivery_id']==key

def test_concurrent_consumers_do_not_execute_one_pending_event_twice():
    key=identity();inbox.accept(key,'payment.failed',{'user_id':'fixture-owner'});calls=[]
    def execute(event,payload):calls.append(payload['_delivery_id']);time.sleep(.03);return []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(lambda _:inbox.process_batch(SimpleNamespace(process_event=execute)),range(16)))
    assert calls.count(key)==1

def test_partial_action_failure_is_retained_for_review_instead_of_silently_replaying_successes():
    key=identity();inbox.accept(key,'payment.failed',{'user_id':'fixture-owner'})
    inbox.process_batch(SimpleNamespace(process_event=lambda *args:[SimpleNamespace(status=ExecutionStatusEnum.DEAD_LETTER)]))
    row=inbox.admin_db.fetch_one('SELECT * FROM automation_event_inbox WHERE id=?',(key,))
    assert row['state']=='review' and row['completed_at'] is None and json.loads(row['payload'])['user_id']=='fixture-owner'

def test_billing_action_replays_use_one_bounded_notification_identity(monkeypatch):
    rule=next(rule for rule in SEED_RULES if rule.trigger_event=='payment.failed');calls=[]
    monkeypatch.setattr(automation_repository,'get_rules_by_event',lambda _: [rule])
    monkeypatch.setattr(automation_repository,'add_execution_log',lambda _:None)
    monkeypatch.setattr(automation_engine,'execute_action',lambda action,payload,**kwargs:calls.append(payload['_action_delivery_id']) or {'status':'success'})
    payload={'user_id':'fixture-owner','_delivery_id':'event:'+('x'*180)}
    automation_engine.process_event('payment.failed',payload);automation_engine.process_event('payment.failed',payload)
    assert len(calls[0])==64 and calls[0]==calls[1]

def test_cancellation_seed_never_overrides_the_authoritative_plan_quota():
    seed=next(rule for rule in SEED_RULES if rule.id=='rule_subscription_cancelled')
    assert all(action.action_type!=ActionTypeEnum.GRANT_QUOTA_OVERRIDE for action in seed.actions)
    db=inbox.admin_db;row=db.fetch_one('SELECT * FROM automation_rules WHERE id=?',(seed.id,))
    legacy=[{'action_type':'grant_quota_override','target':'quota_service','payload':{'quota':5,'reason':'Subscription cancelled — reverted to free tier'}},{'action_type':'send_email','target':'notification_service','payload':{'template':'cancellation','priority':'medium'}}]
    try:
        db.execute('UPDATE automation_rules SET name=?,actions_json=? WHERE id=?',('Subscription Cancellation Downgrade',json.dumps(legacy),seed.id));automation_repository.migrate_legacy_cancel_seed()
        assert len(json.loads(db.fetch_one('SELECT actions_json FROM automation_rules WHERE id=?',(seed.id,))['actions_json']))==1
        legacy[0]['payload']['quota']=6
        db.execute('UPDATE automation_rules SET name=?,actions_json=? WHERE id=?',('Subscription Cancellation Downgrade',json.dumps(legacy),seed.id));automation_repository.migrate_legacy_cancel_seed()
        assert json.loads(db.fetch_one('SELECT actions_json FROM automation_rules WHERE id=?',(seed.id,))['actions_json'])==legacy
    finally:db.execute('UPDATE automation_rules SET name=?,description=?,actions_json=?,updated_at=? WHERE id=?',(row['name'],row['description'],row['actions_json'],row['updated_at'],seed.id))

def test_webhook_cannot_reach_unapproved_or_private_destinations_and_block_action_does_not_claim_success(monkeypatch):
    action=ActionRule(action_type=ActionTypeEnum.WEBHOOK,target='http://169.254.169.254/latest/meta-data')
    with pytest.raises(RuntimeError):automation_engine._dispatch_webhook(action,{})
    monkeypatch.setenv('AUTOMATION_WEBHOOK_ALLOWED_HOSTS','approved.example.test')
    monkeypatch.setattr('socket.getaddrinfo',lambda *args,**kwargs:[(2,1,6,'',('127.0.0.1',443))])
    action.target='https://approved.example.test/hook'
    with pytest.raises(RuntimeError,match='public addresses'):automation_engine._dispatch_webhook(action,{})
    assert automation_engine._dispatch_block_ip(ActionRule(action_type=ActionTypeEnum.BLOCK_IP),{'ip_address':'192.0.2.10'})['status']=='manual_review'
