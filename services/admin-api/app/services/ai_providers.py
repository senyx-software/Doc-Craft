"""Small protocol adapters; URLs, credentials and token ceilings are server-owned."""
import http.client
import json
import socket
import ssl
import time
from uuid import uuid4
from fastapi import HTTPException
from app.services.ai_security import endpoint_target, fail


def post_json(provider, path, payload, headers):
    url, port, address = endpoint_target(provider)
    deadline = time.monotonic() + provider.timeout_seconds
    # Connect to a validated IP while preserving TLS SNI and Host verification.
    connection = http.client.HTTPConnection(url.hostname, port, timeout=provider.timeout_seconds)
    sock = None
    try:
        sock = socket.create_connection((address, port), timeout=provider.timeout_seconds)
        sock.settimeout(max(.01, deadline - time.monotonic()))
        if url.scheme == 'https':
            sock = ssl.create_default_context().wrap_socket(sock, server_hostname=url.hostname)
        connection.sock = sock
        name = '[' + url.hostname + ']' if ':' in url.hostname else url.hostname
        host = name if port in (80, 443) else f'{name}:{port}'
        sock.settimeout(max(.01, deadline - time.monotonic()))
        connection.request('POST', url.path.rstrip('/') + path, json.dumps(payload, ensure_ascii=False).encode(), {'Content-Type': 'application/json', 'Host': host, **headers})
        sock.settimeout(max(.01, deadline - time.monotonic()))
        response = connection.getresponse()
        if response.status != 200:
            code = 'PROVIDER_RATE_LIMITED' if response.status == 429 else 'CONTEXT_LIMIT' if response.status == 413 else 'PROVIDER_UNCONFIGURED' if response.status in (401, 403, 404) else 'PROVIDER_UNAVAILABLE'
            fail(code, 429 if response.status == 429 else 503)
        chunks, size = [], 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError()
            sock.settimeout(remaining)
            chunk = response.read1(min(65536, 2000001 - size))
            if not chunk:
                break
            size += len(chunk)
            if size > 2000000:
                fail('PROVIDER_RESPONSE_INVALID')
            chunks.append(chunk)
        return json.loads(b''.join(chunks))
    except HTTPException:
        raise
    except (TimeoutError, socket.timeout):
        fail('PROVIDER_TIMEOUT', 504)
    except Exception:
        fail('PROVIDER_UNAVAILABLE')
    finally:
        connection.close()
        if sock:
            sock.close()


def anthropic_messages(messages):
    system, result = [], []
    for message in messages:
        if message['role'] == 'system':
            system.append(message.get('content') or '')
        elif message['role'] == 'tool':
            block = {'type': 'tool_result', 'tool_use_id': message['tool_call_id'], 'content': message.get('content') or ''}
            if result and result[-1]['role'] == 'user' and isinstance(result[-1]['content'], list):
                result[-1]['content'].append(block)
            else:
                result.append({'role': 'user', 'content': [block]})
        elif message.get('tool_calls'):
            content = [{'type': 'text', 'text': message['content']}] if message.get('content') else []
            for call in message['tool_calls']:
                content.append({'type': 'tool_use', 'id': call['id'], 'name': call['function']['name'], 'input': json.loads(call['function']['arguments'])})
            result.append({'role': 'assistant', 'content': content})
        else:
            result.append({'role': message['role'], 'content': message.get('content') or ''})
    return '\n'.join(system), result


def infer(provider, model, secret, messages, tools, transport=post_json, output_limit=None):
    try:
        return _infer(provider, model, secret, messages, tools, transport, output_limit)
    except HTTPException:
        raise
    except Exception:
        # Untrusted endpoint JSON must never escape as a traceback or echo
        # response contents, credentials, headers or configured identifiers.
        fail('PROVIDER_RESPONSE_INVALID')


def _infer(provider, model, secret, messages, tools, transport, output_limit):
    limit = min(model.max_output_tokens, output_limit or model.max_output_tokens)
    headers = {'Authorization': 'Bearer ' + secret} if secret else {}
    if provider.kind == 'anthropic':
        system, history = anthropic_messages(messages)
        payload = {'model': model.identifier, 'system': system, 'messages': history, 'max_tokens': limit}
        if tools:
            payload['tools'] = [{'name': t['function']['name'], 'description': t['function'].get('description', ''), 'input_schema': t['function']['parameters']} for t in tools]
        data = transport(provider, '/messages', payload, {'x-api-key': secret or '', 'anthropic-version': '2023-06-01'})
        text = '\n'.join(block['text'] for block in data.get('content', []) if block.get('type') == 'text')
        calls = [{'id': block['id'], 'type': 'function', 'function': {'name': block['name'], 'arguments': json.dumps(block['input'])}} for block in data.get('content', []) if block.get('type') == 'tool_use']
        usage = {'input_tokens': data.get('usage', {}).get('input_tokens'), 'output_tokens': data.get('usage', {}).get('output_tokens')}
        finish = 'length' if data.get('stop_reason') == 'max_tokens' else 'stop'
        message = {'role': 'assistant', 'content': text, 'tool_calls': calls}
    elif provider.kind == 'ollama':
        history = json.loads(json.dumps(messages))
        for message in history:
            for call in message.get('tool_calls') or []:
                call['function']['arguments'] = json.loads(call['function']['arguments'])
        payload = {'model': model.identifier, 'messages': history, 'stream': False, 'keep_alive': model.idle_unload_seconds,
                   'options': {'num_ctx': model.context_window, 'num_predict': limit, 'temperature': 0}}
        if model.ollama_think is not None:
            payload['think'] = model.ollama_think
        if model.ollama_num_threads is not None:
            payload['options']['num_thread'] = model.ollama_num_threads
        if tools:
            payload['tools'] = tools
        data = transport(provider, '/chat', payload, headers)
        message = data.get('message', {})
        for call in message.get('tool_calls') or []:
            call['id'] = 'call_' + uuid4().hex
            call['type'] = 'function'
            call['function']['arguments'] = json.dumps(call['function']['arguments'])
        usage = {'input_tokens': data.get('prompt_eval_count'), 'output_tokens': data.get('eval_count')}
        finish = 'length' if data.get('done_reason') == 'length' else 'stop'
    else:
        payload = {'model': model.identifier, 'messages': messages, model.token_limit_parameter: limit, 'stream': False}
        if tools:
            payload.update(tools=tools, tool_choice='auto')
        data = transport(provider, '/chat/completions', payload, headers)
        choice = data.get('choices', [{}])[0]
        message, finish = choice.get('message', {}), choice.get('finish_reason', 'stop')
        usage = {'input_tokens': data.get('usage', {}).get('prompt_tokens'), 'output_tokens': data.get('usage', {}).get('completion_tokens')}
    if secret and secret in json.dumps(data):
        fail('PROVIDER_RESPONSE_INVALID')
    if message.get('role') != 'assistant' or not isinstance(message.get('content') or '', str) or len(message.get('content') or '') > 64000:
        fail('PROVIDER_RESPONSE_INVALID')
    calls = message.get('tool_calls') or []
    names = {tool['function']['name'] for tool in tools}
    if not isinstance(calls, list) or len(calls) > 20:
        fail('PROVIDER_RESPONSE_INVALID')
    clean_calls = []
    for call in calls:
        function = call.get('function', {})
        if function.get('name') not in names or not isinstance(function.get('arguments'), str) or len(function['arguments']) > 16000:
            fail('PROVIDER_TOOL_REJECTED')
        try:
            if not isinstance(json.loads(function['arguments']), dict):
                raise ValueError()
        except Exception:
            fail('PROVIDER_TOOL_REJECTED')
        clean_calls.append({'id': str(call.get('id', ''))[:100], 'type': 'function', 'function': {'name': function['name'], 'arguments': function['arguments']}})
    if not clean_calls and not (message.get('content') or '').strip():
        fail('PROVIDER_RESPONSE_INVALID')
    return {'message': {'role': 'assistant', 'content': message.get('content') or '', **({'tool_calls': clean_calls} if clean_calls else {})}, 'finish_reason': finish, 'usage': usage}
