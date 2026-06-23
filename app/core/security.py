from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def require_internal_api_key(x_internal_api_key: str | None = Header(default=None)) -> None:
    expected = get_settings().internal_service_api_key
    if not x_internal_api_key or x_internal_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_internal_api_key",
        )
