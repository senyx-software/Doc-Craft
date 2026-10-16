from typing import List, Optional, Union
from pydantic import BaseModel, EmailStr, Field


class AdminLoginRequest(BaseModel):
    email: EmailStr = Field(..., json_schema_extra={"example": "tech@senyxsoftware.com"})
    password: str = Field(..., min_length=6, json_schema_extra={"example": "SyntheticSchemaExamplePass2026!"})


class AdminVerifyLoginCodeRequest(BaseModel):
    email: EmailStr = Field(..., json_schema_extra={"example": "tech@senyxsoftware.com"})
    verification_code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        description="6-digit verification code sent to email",
        json_schema_extra={"example": "123456"},
    )


class AdminLoginCodeRequiredResponse(BaseModel):
    status: str = "verification_code_required"
    message: str
    email: str
    expires_in_minutes: int = 10


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    admin_id: str
    email: str
    name: Optional[str] = None
    role_name: str
    permissions: List[str]
    is_super_admin: bool
    totp_enabled: bool
    requires_totp_setup: bool = False


class TOTPSetupResponse(BaseModel):
    totp_secret: str
    provisioning_uri: str
    qr_code_hint: str
    qr_code_url: str


class TOTPVerifyRequest(BaseModel):
    totp_code: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP authentication code")


class AdminProfileResponse(BaseModel):
    admin_id: str
    email: str
    name: Optional[str] = None
    role_name: str
    permissions: List[str]
    is_super_admin: bool
    totp_enabled: bool


class UpdateAdminProfileRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., json_schema_extra={"example": "tech@senyxsoftware.com"})


class ResetPasswordRequest(BaseModel):
    email: EmailStr = Field(..., json_schema_extra={"example": "tech@senyxsoftware.com"})
    verification_code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code sent to email")
    new_password: str = Field(..., min_length=6, description="New account password")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=6, description="Existing account password")
    new_password: str = Field(..., min_length=6, description="New account password")
