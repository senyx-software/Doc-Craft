import base64
from io import BytesIO

import pyotp
import qrcode
from qrcode.image.pil import PilImage

from app.core.config import settings


def generate_totp_secret() -> str:
    """Generate a random 32-character base32 TOTP secret key."""
    return pyotp.random_base32()


def get_totp_provisioning_uri(totp_secret: str, email: str) -> str:
    """Generate a provisioning URI for QR code generation (Google Authenticator / Authy)."""
    totp = pyotp.TOTP(totp_secret)
    return totp.provisioning_uri(name=email, issuer_name=settings.TOTP_ISSUER)


def generate_qr_code_data_uri(provisioning_uri: str) -> str:
    """Render the provisioning URI as a real scannable QR code PNG, returned as a
    base64 data URI the frontend can drop straight into an <img src>. Mirrors
    services/auth's end-user 2FA flow (QRCode.toDataURL), which admin setup never
    had — it only ever sent a text hint, no actual QR image."""
    img = qrcode.make(provisioning_uri, box_size=8, border=2, image_factory=PilImage)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def verify_totp_code(totp_secret: str, code: str, account_id: str | None = None) -> bool:
    """Verify a 6-digit TOTP code against the admin's secret key with window tolerance."""
    if not totp_secret or not code:
        return False
    
    cleaned_code = str(code).strip().replace(" ", "")
    if len(cleaned_code) != 6 or not cleaned_code.isdigit():
        return False

    totp = pyotp.TOTP(totp_secret)
    import time,hashlib,hmac
    step=int(time.time()//30)
    match=next((value for value in range(step+settings.TOTP_WINDOW,step-settings.TOTP_WINDOW-1,-1) if hmac.compare_digest(totp.at(value*30),cleaned_code)),None)
    if match is None:return False
    if account_id is None:raise ValueError('Account-bound TOTP verification is required')
    from app.db.admin_db import admin_db
    key=hashlib.sha256((account_id+':'+totp_secret).encode()).hexdigest()
    changed=admin_db.execute("""INSERT INTO admin_totp_steps(account_key,last_step) VALUES(?,?)
        ON CONFLICT(account_key) DO UPDATE SET last_step=excluded.last_step WHERE admin_totp_steps.last_step<excluded.last_step""",(key,match))
    return changed==1
