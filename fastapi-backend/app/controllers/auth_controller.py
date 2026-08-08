import uuid
from datetime import datetime, timedelta, timezone  # noqa: F401 — timedelta used in JWT exp

import bcrypt
import jwt
from fastapi import Request, Response
from firebase_admin import auth as firebase_auth

from app.config.env import get_settings
from app.config.firebase import get_firebase_app
from app.config.supabase import get_supabase
from app.constants.constants import (
    ACCESS_TOKEN_EXPIRY,
    MAX_DEVICES_PER_USER,
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_DAYS,
)
from app.middleware.auth import get_client_ip
from app.utils.api_error import ApiError
from app.utils.api_response import ApiResponse
from app.utils.serializers import serialize_device, serialize_user


def _cookie_options() -> dict:
    settings = get_settings()
    return {
        "httponly": True,
        "secure": settings.is_production,
        "samesite": "strict" if settings.is_production else "lax",
        "max_age": REFRESH_TOKEN_DAYS * 24 * 60 * 60,
        "path": "/",
    }


async def login(request: Request, response: Response, firebase_id_token: str) -> ApiResponse:
    get_firebase_app()
    settings = get_settings()
    supabase = get_supabase()

    try:
        decoded = firebase_auth.verify_id_token(firebase_id_token)
    except Exception as exc:
        raise ApiError(401, "Invalid or expired Firebase token") from exc

    user_result = supabase.table("users").select("*").eq("firebase_uid", decoded["uid"]).maybe_single().execute()
    user_row = user_result.data
    user = serialize_user(user_row) if user_row else None

    access_token = jwt.encode(
        {
            "sub": user["id"] if user else None,
            "firebaseUid": decoded["uid"],
            "email": decoded.get("email") or "",
            "email_verified": decoded.get("email_verified") or False,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )

    if isinstance(access_token, bytes):
        access_token = access_token.decode()

    refresh_token = str(uuid.uuid4())
    refresh_token_hash = bcrypt.hashpw(refresh_token.encode(), bcrypt.gensalt()).decode()
    token_family = str(uuid.uuid4())

    if user:
        devices_result = (
            supabase.table("devices")
            .select("*")
            .eq("user_id", user["id"])
            .eq("is_revoked", False)
            .order("last_used_at")
            .execute()
        )
        active_devices = devices_result.data or []
        if len(active_devices) >= MAX_DEVICES_PER_USER:
            oldest = active_devices[0]
            supabase.table("devices").update(
                {"is_revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", oldest["id"]).execute()

        expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS)
        user_agent = request.headers.get("user-agent") or ""
        supabase.table("devices").insert(
            {
                "user_id": user["id"],
                "device_name": user_agent[:80] if user_agent else "Web Session",
                "device_type": "web",
                "refresh_token_hash": refresh_token_hash,
                "token_family": token_family,
                "last_used_at": datetime.now(timezone.utc).isoformat(),
                "ip_address": get_client_ip(request),
                "user_agent": user_agent,
                "expires_at": expires_at.isoformat(),
            }
        ).execute()

    response.set_cookie(REFRESH_COOKIE_NAME, refresh_token, **_cookie_options())

    return ApiResponse(
        200,
        "Login successful",
        {
            "accessToken": access_token,
            "user": (
                {
                    "_id": user["id"],
                    "username": user["username"],
                    "displayName": user["displayName"],
                    "avatarUrl": user["avatarUrl"],
                    "email": user["email"],
                }
                if user
                else None
            ),
        },
    )


async def _match_device_by_refresh_token(refresh_token: str) -> dict | None:
    supabase = get_supabase()
    devices_result = supabase.table("devices").select("*").eq("is_revoked", False).execute()
    for device in devices_result.data or []:
        if bcrypt.checkpw(refresh_token.encode(), device["refresh_token_hash"].encode()):
            return device
    return None


async def refresh(request: Request, response: Response) -> ApiResponse:
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise ApiError(401, "No refresh token provided")

    matched_device = await _match_device_by_refresh_token(refresh_token)
    if not matched_device:
        response.delete_cookie(REFRESH_COOKIE_NAME, path="/")
        raise ApiError(401, "Invalid or expired refresh token")

    supabase = get_supabase()
    settings = get_settings()
    user_result = supabase.table("users").select("*").eq("id", matched_device["user_id"]).maybe_single().execute()
    user_row = user_result.data
    if not user_row:
        response.delete_cookie(REFRESH_COOKIE_NAME, path="/")
        raise ApiError(401, "User not found")

    user = serialize_user(user_row)
    new_access_token = jwt.encode(
        {
            "sub": user["id"],
            "firebaseUid": user["firebaseUid"],
            "email": user.get("email") or "",
            "email_verified": user.get("emailVerified") or False,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    if isinstance(new_access_token, bytes):
        new_access_token = new_access_token.decode()

    new_refresh_token = str(uuid.uuid4())
    new_refresh_token_hash = bcrypt.hashpw(new_refresh_token.encode(), bcrypt.gensalt()).decode()
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS)

    supabase.table("devices").update(
        {
            "refresh_token_hash": new_refresh_token_hash,
            "last_used_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": expires_at.isoformat(),
        }
    ).eq("id", matched_device["id"]).execute()

    response.set_cookie(REFRESH_COOKIE_NAME, new_refresh_token, **_cookie_options())
    return ApiResponse(200, "Token refreshed successfully", {"accessToken": new_access_token})


async def logout(request: Request, response: Response) -> ApiResponse:
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")

    if refresh_token:
        matched_device = await _match_device_by_refresh_token(refresh_token)
        if matched_device:
            supabase = get_supabase()
            supabase.table("devices").update(
                {"is_revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", matched_device["id"]).execute()

    return ApiResponse(200, "Logged out successfully")


async def get_devices(user: dict) -> ApiResponse:
    supabase = get_supabase()
    result = (
        supabase.table("devices")
        .select("id, device_name, device_type, last_used_at, ip_address, user_agent, created_at")
        .eq("user_id", user["id"])
        .eq("is_revoked", False)
        .order("last_used_at", desc=True)
        .execute()
    )
    devices = [serialize_device(row) for row in result.data or []]
    return ApiResponse(200, "Active devices retrieved", devices)


async def revoke_device(user: dict, device_id: str) -> ApiResponse:
    supabase = get_supabase()
    result = (
        supabase.table("devices")
        .select("*")
        .eq("id", device_id)
        .eq("user_id", user["id"])
        .eq("is_revoked", False)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise ApiError(404, "Device session not found or already revoked")

    supabase.table("devices").update(
        {"is_revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", device_id).execute()

    return ApiResponse(200, "Device session revoked successfully")
