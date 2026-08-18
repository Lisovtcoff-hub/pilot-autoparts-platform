from datetime import UTC, datetime, timedelta
from secrets import compare_digest

import jwt
from fastapi import HTTPException, Request, status

from .config import get_settings
from .schemas import AdminIdentity

COOKIE_NAME = "pilot_admin_session"
ALGORITHM = "HS256"


def authenticate(username: str, password: str) -> bool:
    settings = get_settings()
    return compare_digest(username, settings.admin_username) and compare_digest(password, settings.admin_password)


def create_session_token(username: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + timedelta(hours=settings.session_hours),
        "aud": "pilot-admin",
    }
    return jwt.encode(payload, settings.session_secret, algorithm=ALGORITHM)


def require_admin(request: Request) -> AdminIdentity:
    token = request.cookies.get(COOKIE_NAME, "")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется вход продавца")
    try:
        payload = jwt.decode(
            token,
            get_settings().session_secret,
            algorithms=[ALGORITHM],
            audience="pilot-admin",
        )
    except jwt.PyJWTError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия истекла") from error
    username = str(payload.get("sub", ""))
    if not username:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Некорректная сессия")
    return AdminIdentity(username=username)
