"""Verify document API identities independently of caller-supplied headers."""
import os
import jwt
from shared.service_auth import verify_user_token, async_service_client
import httpx
from fastapi import Request
from fastapi.responses import JSONResponse


async def authenticate_document_request(request: Request, call_next):
    path = request.url.path
    public = path in {"/health", "/ready", "/docs", "/redoc", "/openapi.json"} or (
        request.method == "GET" and path.startswith(("/v1/document/shared/", "/v1/document/download-file/"))
    )
    if public or request.method == "OPTIONS":
        return await call_next(request)
    if path.startswith('/v1/document/internal/'):
        from shared.service_auth import authorize_service
        from fastapi import HTTPException
        try:await authorize_service('document',request)
        except HTTPException as error:return JSONResponse({'detail':'Service authorization rejected'},status_code=error.status_code)
        return await call_next(request)
    bearer = request.headers.get("authorization", "")
    if not bearer.startswith("Bearer "):
        return JSONResponse({"detail": "Verified access token required"}, status_code=401)
    try:
        payload = verify_user_token(bearer[7:])
        if payload.get("type") != "access" or not isinstance(payload["sub"], str):
            raise ValueError("Invalid identity")
    except (jwt.PyJWTError, ValueError):
        return JSONResponse({"detail": "Invalid or expired access token"}, status_code=401)
    try:
        async with async_service_client('auth', timeout=10) as client:
            response = await client.post(
                f"{os.getenv('AUTH_SERVICE_URL', 'http://localhost:3011')}/internal/verify-token",
                json={'userId':payload['sub'],'token':bearer[7:]},
            )
        if response.status_code in (401, 403, 404):
            return JSONResponse({"detail": "Account unavailable"}, status_code=403)
        if response.status_code != 200:
            raise ValueError("Account verification unavailable")
        result=response.json()
        account = result.get("user", {})
        if not result.get('valid') or account.get("id") != payload["sub"]:
            return JSONResponse({"detail": "Account unavailable"}, status_code=403)
        payload["plan"] = account.get("plan", "free")
    except (httpx.RequestError, ValueError):
        return JSONResponse({"detail": "Account verification unavailable"}, status_code=503)
    headers = [(k, v) for k, v in request.scope["headers"] if k.lower() not in (b"x-user-id", b"x-user-plan", b"x-user-email")]
    for key, value in (("x-user-id", payload["sub"]), ("x-user-plan", payload.get("plan", "free")), ("x-user-email", payload.get("email", ""))):
        if isinstance(value, str):
            headers.append((key.encode(), value.encode()))
    request.scope["headers"] = headers
    return await call_next(request)
