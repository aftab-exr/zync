import uuid
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth

from app.config.env import get_settings
from app.config.firebase import get_firebase_app
from app.config.supabase import get_supabase
from app.utils.serializers import serialize_user

security = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    uid: str
    sub: str | None
    email: str
    email_verified: bool


async def authenticate_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    ) -> dict | None:
    from app.utils.api_error import ApiError

    if not credentials or credentials.scheme.lower() != "bearer":
        raise ApiError(401, "No token provided")

    token = credentials.credentials
    settings = get_settings()
    supabase = get_supabase()

    try:
        decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(401, "Token expired") from exc
    except jwt.InvalidTokenError:
        try:
            get_firebase_app()
            firebase_decoded = firebase_auth.verify_id_token(token)
            result = (
                supabase.table("users")
                .select("*")
                .eq("firebase_uid", firebase_decoded["uid"])
                .maybe_single()
                .execute()
            )
            user_row = getattr(result, "data", None) if result else None
            request.state.user = serialize_user(user_row) if user_row else None
            request.state.auth_context = AuthContext(
                uid=firebase_decoded["uid"],
                sub=user_row["id"] if user_row else None,
                email=firebase_decoded.get("email") or "",
                email_verified=firebase_decoded.get("email_verified") or False,
            )
            return request.state.user
        except Exception as exc:
            raise ApiError(401, "Invalid token") from exc

    user = None
    if decoded.get("sub"):
        result = supabase.table("users").select("*").eq("id", decoded["sub"]).maybe_single().execute()
        user_row = getattr(result, "data", None) if result else None
        user = serialize_user(result.data) if result.data else None

    request.state.user = user
    request.state.auth_context = AuthContext(
        uid=decoded.get("firebaseUid") or decoded.get("firebase_uid") or "",
        sub=decoded.get("sub"),
        email=decoded.get("email") or "",
        email_verified=decoded.get("email_verified") or False,
    )
    return user


def get_current_user(request: Request) -> dict | None:
    return getattr(request.state, "user", None)


def get_auth_context(request: Request) -> AuthContext:
    return request.state.auth_context


async def require_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict:
    await authenticate_user(request, credentials)
    user = get_current_user(request)
    if not user:
        from app.utils.api_error import ApiError

        raise ApiError(401, "Unauthorized")
    return user


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return ""
