"""Redact delivery credentials from metadata before writing notification logs."""
import re
SENSITIVE=re.compile(r'^(?:token|code|password|temp_password|temporary_password|verification_code|reset_token|access[_-]?token|refresh[_-]?token|authorization|cookie|api[_-]?key|secret|totp_secret|documentUrl|invite_link)$',re.I)


def redact(value):
    if isinstance(value,dict): return {key:'[REDACTED]' if SENSITIVE.match(str(key)) else redact(item) for key,item in value.items()}
    if isinstance(value,list): return [redact(item) for item in value]
    if isinstance(value,str):
        return re.sub(r'Bearer\s+[A-Za-z0-9._~-]+','Bearer [REDACTED]',re.sub(r'([?&#](?:token|signature|secret|code|key)=)[^&#\s]+',r'\1[REDACTED]',value,flags=re.I),flags=re.I)
    return value
