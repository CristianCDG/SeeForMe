import secrets
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader
from config import get_settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(provided: str | None = Security(api_key_header)):
    expected = get_settings().app_api_key.get_secret_value()
    if provided is None or not secrets.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
