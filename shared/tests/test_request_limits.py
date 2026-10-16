import pytest
from shared.request_limits import RequestBodyLimit


@pytest.mark.asyncio
@pytest.mark.parametrize("parts,expected",[([b'ab',b'cd'],200),([b'abcd',b'e'],413)])
async def test_raw_chunked_body_limits_cannot_be_bypassed_by_missing_content_length(parts,expected):
    messages=[{"type":"http.request","body":value,"more_body":index<len(parts)-1} for index,value in enumerate(parts)]
    sent=[]
    async def receive(): return messages.pop(0)
    async def send(message):sent.append(message)
    async def app(scope,read,send):
        body=b''
        while True:
            message=await read();body+=message['body']
            if not message.get('more_body'):break
        assert body==b'abcd'
        await send({'type':'http.response.start','status':200,'headers':[]})
        await send({'type':'http.response.body','body':body})
    await RequestBodyLimit(app,max_bytes=4)({'type':'http','headers':[]},receive,send)
    assert sent[0]['status']==expected
