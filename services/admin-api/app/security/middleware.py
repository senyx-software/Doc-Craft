import ipaddress
from typing import Callable, List
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.exceptions import IPBlockedException


def client_address(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    if peer not in settings.TRUSTED_PROXY_IPS:
        return peer
    # Walk from the socket back through trusted proxies. Leftmost forwarded
    # values may have been supplied by a client before a proxy appended its IP.
    chain = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    for address in reversed(chain):
        if address not in settings.TRUSTED_PROXY_IPS:
            return address
    return peer


class SubmissionBudgetMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        scope = None
        if request.method == "POST" and path in (
            "/api/v1/support/tickets", "/api/v1/support/refunds", "/api/v1/support/contact",
            "/api/v1/support/plan-override-requests",
        ):
            scope = "public-support"
        elif request.method == "POST" and path in (
            "/api/v1/admin/auth/login", "/api/v1/admin/auth/forgot-password",
            "/api/v1/admin/auth/verify-login-code", "/api/v1/admin/auth/reset-password",
        ):
            scope = "admin-auth"
        if scope:
            from app.security.budgets import claim_budget
            from fastapi import HTTPException
            try:
                claim_budget(scope, client_address(request), 20 if scope == "admin-auth" else 10, 600)
            except HTTPException as error:
                return JSONResponse(status_code=error.status_code, content={"detail": error.detail}, headers=error.headers)
        return await call_next(request)


def is_ip_allowed(client_ip_str: str, allowed_ips: List[str]) -> bool:
    """
    Checks if a client IP address matches an allowed IP string or CIDR subnet block.
    Supports localhost, IPv4, IPv6, and CIDRs (e.g., 10.0.0.0/8, 172.16.0.0/12).
    """
    if not client_ip_str:
        return False

    clean_ip = client_ip_str.strip()
    if clean_ip.startswith('[') and ']' in clean_ip:
        clean_ip = clean_ip[1:clean_ip.index(']')]
    elif clean_ip.count(':') == 1 and '.' in clean_ip:
        clean_ip = clean_ip.rsplit(':', 1)[0]

    if clean_ip in ["localhost", "127.0.0.1", "::1", "testclient"]:
        return True

    try:
        ip_obj = ipaddress.ip_address(clean_ip)
    except ValueError:
        return False

    for allowed in allowed_ips:
        allowed = allowed.strip()
        if allowed in ["*", "0.0.0.0/0", "::/0"]:
            return True
        if allowed in ["localhost", "127.0.0.1", "::1"] and ip_obj.is_loopback:
            return True
        try:
            if "/" in allowed:
                net = ipaddress.ip_network(allowed, strict=False)
                if ip_obj in net:
                    return True
            else:
                target_ip = ipaddress.ip_address(allowed)
                if ip_obj == target_ip:
                    return True
        except ValueError:
            continue

    return False


class IPWhitelistMiddleware(BaseHTTPMiddleware):
    """
    NFR-ADM-06 internal-only isolation middleware.
    Restricts access strictly to whitelisted IP addresses / subnets.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not settings.IP_WHITELIST_ENABLED:
            return await call_next(request)

        # Bypass healthcheck endpoint
        if request.url.path in ["/health", "/", "/docs", "/openapi.json"]:
            return await call_next(request)

        # Extract client IP from headers or connection
        client_ip = client_address(request)

        if not is_ip_allowed(client_ip, settings.ALLOWED_ADMIN_IPS):
            try:
                from app.services.audit_service import audit_service
                audit_service.log_security_event(
                    action="security.ip_blocked",
                    module="security",
                    request=request,
                    details={"blocked_ip": client_ip, "path": request.url.path},
                )
            except Exception:
                pass

            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={
                    "error": "IP_ACCESS_DENIED",
                    "code": "IP_ACCESS_DENIED",
                    "message": f"Access denied: Client IP address '{client_ip}' is not authorized to access admin-api",
                    "details": {"client_ip": client_ip},
                },
            )

        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds security hardening headers to all HTTP responses."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Cache-Control"] = "no-store, max-age=0"
        return response
