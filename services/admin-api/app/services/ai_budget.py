"""Durable cross-worker budgets and bounded priority admission; Redis is not a ledger."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_CEILING
import os
import threading
import time
from fastapi import HTTPException
from app.db.admin_db import admin_db


@contextmanager
def transaction():
    connection = admin_db.get_connection()
    try:
        cursor = connection.cursor()
        if admin_db.is_postgres:
            cursor.execute('SELECT pg_advisory_xact_lock(78204301)')
        else:
            cursor.execute('BEGIN IMMEDIATE')
        def execute(sql, values=()):
            cursor.execute(admin_db._convert_query(sql), values)
            return cursor
        yield execute
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        admin_db._release_connection(connection)


def cost(model, input_tokens, output_tokens, locality):
    if locality == 'local':
        return 0
    # One USD/million tokens equals one micro-USD/token.
    amount = Decimal(str(model.input_usd_per_million or 0)) * input_tokens + Decimal(str(model.output_usd_per_million or 0)) * output_tokens
    return int(amount.to_integral_value(rounding=ROUND_CEILING))


def microdollars(value):
    return int(Decimal(str(value)) * 1000000)


def reserve(request, provider, model, policy, config, plan, input_tokens):
    now = datetime.now(timezone.utc)
    month = now.strftime('%Y-%m')
    tokens = input_tokens + model.max_output_tokens
    estimate = cost(model, input_tokens, model.max_output_tokens, provider.locality)
    with transaction() as execute:
        if execute('SELECT request_id FROM ai_inference_ledger WHERE request_id=?', (request.request_id,)).fetchone():
            raise HTTPException(409, {'code': 'INFERENCE_REPLAY', 'message': 'This inference attempt was already reserved; retry the chat turn to reconcile saved operations.'})
        def totals(where, values):
            row = execute("SELECT COUNT(*),COALESCE(SUM(input_tokens+output_tokens),0),COALESCE(SUM(cost_microusd),0) FROM ai_inference_ledger WHERE status<>'not_dispatched' AND month=?" + where, (month, *values)).fetchone()
            return tuple(int(value) for value in row)
        global_usage = totals('', ())
        plan_usage = totals(' AND plan=?', (plan,))
        user_usage = totals(' AND user_id=?', (request.user_id,))
        limits = [(global_usage, None, None, config.monthly_cloud_usd), (plan_usage, policy.monthly_requests, policy.monthly_tokens, policy.monthly_cloud_usd),
                  (user_usage, policy.per_user_monthly_requests, policy.per_user_monthly_tokens, policy.per_user_monthly_cloud_usd)]
        for usage, requests_limit, token_limit, spend in limits:
            if requests_limit is not None and usage[0] + 1 > requests_limit or token_limit is not None and usage[1] + tokens > token_limit or provider.locality == 'cloud' and (spend <= 0 or usage[2] + estimate > microdollars(spend)):
                raise HTTPException(403, {'code': 'AI_BUDGET_EXCEEDED', 'message': 'Your AI allowance has been reached. Your saved document is still available.'})
        since = (now - timedelta(seconds=60)).isoformat()
        provider_recent = execute('SELECT COUNT(*) FROM ai_inference_ledger WHERE provider_id=? AND created_at>=?', (provider.id, since)).fetchone()[0]
        user_recent = execute('SELECT COUNT(*) FROM ai_inference_ledger WHERE user_id=? AND created_at>=?', (request.user_id, since)).fetchone()[0]
        if provider_recent >= provider.requests_per_minute or user_recent >= policy.requests_per_minute:
            raise HTTPException(429, {'code': 'PROVIDER_RATE_LIMITED', 'message': 'The assistant is busy. Please retry shortly.'})
        execute('''INSERT INTO ai_inference_ledger(request_id,user_id,session_id,plan,model_id,provider_id,locality,policy_version,month,status,input_tokens,output_tokens,cost_microusd,fallback,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', (request.request_id, request.user_id, request.session_id, plan, model.id, provider.id, provider.locality, request.policy_version, month,
            'reserved', input_tokens, model.max_output_tokens, estimate, int(request.fallback), now.isoformat()))


def settle(request_id, status, latency_ms, model, locality, usage=None):
    """Unknown/failed bills retain their reservation rather than pretending they cost zero."""
    if usage is None:
        admin_db.execute('UPDATE ai_inference_ledger SET status=?,latency_ms=?,completed_at=? WHERE request_id=? AND status=?',
                         (status, latency_ms, datetime.now(timezone.utc).isoformat(), request_id, 'reserved'))
        return
    input_tokens, output_tokens = usage
    admin_db.execute('''UPDATE ai_inference_ledger SET status=?,input_tokens=?,output_tokens=?,cost_microusd=?,latency_ms=?,completed_at=? WHERE request_id=? AND status=?''',
                     (status, input_tokens, output_tokens, cost(model, input_tokens, output_tokens, locality), latency_ms, datetime.now(timezone.utc).isoformat(), request_id, 'reserved'))


def resources():
    available_mb = None
    container_mb = None
    try:
        with open('/proc/meminfo') as handle:
            values = dict((line.split(':')[0], int(line.split()[1])) for line in handle)
        available_mb = values['MemAvailable'] // 1024
    except (OSError, KeyError, ValueError):
        pass
    try:
        from pathlib import Path
        limit = (Path('/sys/fs/cgroup') / 'memory.max').read_text().strip()
        current = int((Path('/sys/fs/cgroup') / 'memory.current').read_text().strip())
        if limit != 'max':
            container_mb = max(0, int(limit) - current) // 1048576
    except (OSError, ValueError):
        pass
    cpu_load_percent = min(100, os.getloadavg()[0] / max(1, os.cpu_count() or 1) * 100) if hasattr(os, 'getloadavg') else None
    # Ollama has its own container limit. Admin-api headroom cannot be used
    # as a substitute for host or inference-container memory availability.
    return {'available_memory_mb': available_mb, 'controller_container_available_mb': container_mb, 'cpu_load_percent': cpu_load_percent, 'cpu_measurement': 'one_minute_load_per_logical_cpu', 'logical_cpus': os.cpu_count()}


@contextmanager
def admission(request_id, provider, model, policy, config):
    stamp = time.time()
    timeout = stamp + config.queue_timeout_seconds
    if provider.locality == 'local':
        host = resources()
        if host['available_memory_mb'] is None or host['available_memory_mb'] < config.local_min_available_mb or host.get('controller_container_available_mb') is not None and host['controller_container_available_mb'] < 64 or host['cpu_load_percent'] is not None and host['cpu_load_percent'] > config.local_max_cpu_percent:
            raise HTTPException(503, {'code': 'LOCAL_RESOURCE_LIMIT', 'message': 'The assistant is busy. Please retry shortly.'})
    with transaction() as execute:
        execute('DELETE FROM ai_inference_queue WHERE expires_at<=?', (stamp,))
        if execute('SELECT request_id FROM ai_inference_queue WHERE request_id=?', (request_id,)).fetchone():
            raise HTTPException(409, {'code': 'INFERENCE_REPLAY', 'message': 'This request is already running.'})
        queued = execute('SELECT COUNT(*) FROM ai_inference_queue WHERE state=?', ('waiting',)).fetchone()[0]
        if queued >= 64:
            raise HTTPException(429, {'code': 'AI_QUEUE_FULL', 'message': 'The assistant is busy. Please retry shortly.'})
        execute('INSERT INTO ai_inference_queue VALUES(?,?,?,?,?,?,?,?)', (request_id, provider.id, model.id, provider.locality, policy.priority, timeout + provider.timeout_seconds + 15, stamp, 'waiting'))
    try:
        while True:
            with transaction() as execute:
                execute('DELETE FROM ai_inference_queue WHERE expires_at<=?', (time.time(),))
                active_provider = execute('SELECT COUNT(*) FROM ai_inference_queue WHERE provider_id=? AND state=?', (provider.id, 'running')).fetchone()[0]
                active_model = execute('SELECT COUNT(*) FROM ai_inference_queue WHERE model_id=? AND state=?', (model.id, 'running')).fetchone()[0]
                active_local = execute('SELECT model_id FROM ai_inference_queue WHERE locality=? AND state=?', ('local', 'running')).fetchall()
                scope, value = ('locality', 'local') if provider.locality == 'local' else ('provider_id', provider.id)
                first = execute(f'SELECT request_id FROM ai_inference_queue WHERE {scope}=? AND state=? ORDER BY priority DESC,created_at,request_id LIMIT 1', (value, 'waiting')).fetchone()
                capacity = active_provider < provider.max_concurrency and active_model < model.max_concurrency and (provider.locality != 'local' or len(active_local) < config.local_max_concurrency and all(row[0] == model.id for row in active_local))
                if first and first[0] == request_id and capacity:
                    execute('UPDATE ai_inference_queue SET state=?,expires_at=? WHERE request_id=?', ('running', time.time() + provider.timeout_seconds + 15, request_id))
                    break
            if time.time() >= timeout:
                raise HTTPException(503, {'code': 'AI_QUEUE_TIMEOUT', 'message': 'The assistant is busy. Please retry shortly.'})
            threading.Event().wait(min(.1, max(.01, timeout - time.time())))
        yield
    finally:
        admin_db.execute('DELETE FROM ai_inference_queue WHERE request_id=?', (request_id,))


def usage_report():
    month = datetime.now(timezone.utc).strftime('%Y-%m')
    rows = admin_db.fetch_all('''SELECT plan,provider_id,model_id,locality,status,COUNT(*) AS requests,SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,SUM(cost_microusd) AS cost_microusd,AVG(latency_ms) AS latency_ms,SUM(fallback) AS fallbacks
        FROM ai_inference_ledger WHERE month=? GROUP BY plan,provider_id,model_id,locality,status ORDER BY requests DESC''', (month,))
    return {'month': month, 'groups': rows, 'resources': resources(), 'queue': admin_db.fetch_all('SELECT locality,state,COUNT(*) AS requests FROM ai_inference_queue WHERE expires_at>? GROUP BY locality,state', (time.time(),)),
            'accounting': 'Unknown or failed upstream bills retain their conservative reservation; prices are administrator estimates.'}
