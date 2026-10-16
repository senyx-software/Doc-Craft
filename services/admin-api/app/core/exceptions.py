from typing import Any, Dict, Optional
from fastapi import Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError


class AppException(Exception):
    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_SERVER_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Invalid or expired authentication token", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="UNAUTHORIZED",
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details,
        )


class ForbiddenException(AppException):
    def __init__(self, message: str = "Permission check failed", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="PERMISSION_DENIED",
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
        )


class TOTPRequiredException(AppException):
    def __init__(self, message: str = "2FA TOTP verification required for this sensitive operation", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="TOTP_REQUIRED",
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
        )


class IPBlockedException(AppException):
    def __init__(self, message: str = "Access denied: Client IP is not whitelisted", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="IP_ACCESS_DENIED",
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
        )


class NotFoundException(AppException):
    def __init__(self, message: str = "Requested resource not found", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
            details=details,
        )


class ValidationException(AppException):
    def __init__(self, message: str = "Request validation failed", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.code,
            "code": exc.code,
            "message": exc.message,
            "details": exc.details,
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Pydantic error dicts can carry a raw exception object in ctx.error (e.g.
    # from a `raise ValueError(...)` in a field validator) which plain
    # JSONResponse can't serialize — jsonable_encoder coerces it (and any
    # other non-JSON-native value, like bytes) to a JSON-safe form first.
    errors = jsonable_encoder(exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "VALIDATION_ERROR",
            "code": "VALIDATION_ERROR",
            "message": "Invalid request payload or query parameters",
            "details": {"validation_errors": errors},
        },
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected error occurred on the admin-api service",
            "details": {"error_type": type(exc).__name__, "description": str(exc)},
        },
    )
