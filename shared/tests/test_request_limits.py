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


@pytest.mark.asyncio
@pytest.mark.parametrize('path,expected', [('/templates/uploads',200),('/templates/uploads/',200),('/other',413)])
async def test_upload_size_allowance_does_not_change_other_routes(path, expected):
    sent=[]
    async def receive():return {'type':'http.request','body':b'12345','more_body':False}
    async def send(message):sent.append(message)
    async def app(scope,receive,send):
        await receive()
        await send({'type':'http.response.start','status':200,'headers':[]})
        await send({'type':'http.response.body','body':b''})
    await RequestBodyLimit(app,max_bytes=4,path_limits={'/templates/uploads':6})({'type':'http','path':path},receive,send)
    assert sent[0]['status']==expected
