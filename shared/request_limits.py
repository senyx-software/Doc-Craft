"""Bound ASGI request bodies before parsing, including chunked requests."""
from starlette.responses import JSONResponse


class RequestBodyLimit:
    def __init__(self, app, max_bytes=2*1024*1024, path_limits=None):
        self.app, self.max_bytes = app, max_bytes
        self.path_limits = path_limits or {}

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        messages, size = [], 0
        max_bytes = self.path_limits.get(scope.get('path', '').rstrip('/'), self.max_bytes)
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > max_bytes:
                return await JSONResponse({"detail":"Request body too large"}, status_code=413)(scope, receive, send)
            messages.append(message)
            if not message.get("more_body", False):
                break
        async def bounded_receive():
            return messages.pop(0) if messages else await receive()
        await self.app(scope, bounded_receive, send)
