import math
import re
from datetime import datetime, timezone

import cloudinary.uploader

from app.config.supabase import get_supabase
from app.constants.constants import DISPLAY_NAME_LOCKOUT_DAYS, USERNAME_LOCKOUT_DAYS
from app.middleware.auth import AuthContext
from app.utils.api_error import ApiError
from app.utils.api_response import ApiResponse
from app.utils.serializers import serialize_user

DAY_MS = 24 * 60 * 60 * 1000


def _days_until_unlock(last_changed_at: str | None, lockout_days: int) -> int:
    if not last_changed_at:
        return 0
    last_changed = datetime.fromisoformat(last_changed_at.replace("Z", "+00:00"))
    remaining = lockout_days * DAY_MS - (datetime.now(timezone.utc).timestamp() * 1000 - last_changed.timestamp() * 1000)
    if remaining <= 0:
        return 0
    return math.ceil(remaining / DAY_MS)


def _pluralize_days(n: int) -> str:
    return f"{n} {'day' if n == 1 else 'days'}"


async def setup_profile(auth_context: AuthContext, body) -> ApiResponse:
    supabase = get_supabase()
    username = body.username.lower()

    if not re.match(r"^[a-z0-9_]+$", username, re.IGNORECASE):
        raise ApiError(400, "Username can only contain letters, numbers, and underscores.")

    existing_user = (
        supabase.table("users").select("id").eq("firebase_uid", auth_context.uid).maybe_single().execute()
    )
    existing_user_data = getattr(existing_user, "data", None) if existing_user else None
    if existing_user_data:
        raise ApiError(400, "Profile already exists.")

    existing_username = supabase.table("users").select("id").eq("username", username).maybe_single().execute()
    existing_username_data = getattr(existing_username, "data", None) if existing_username else None
    if existing_username_data:
        raise ApiError(409, "Username already taken.")

    result = supabase.table("users").insert(
        {
            "firebase_uid": auth_context.uid,
            "email": auth_context.email,
            "email_verified": auth_context.email_verified,
            "username": username,
            "display_name": body.display_name,
            "avatar_url": body.avatar_url or "",
        }
    ).execute()

    new_user = serialize_user((result.data or [{}])[0])
    return ApiResponse(201, "Profile created.", new_user)


async def search_users(user: dict, q: str | None) -> ApiResponse:
    if not q or len(q) < 2:
        return ApiResponse(200, "Search results", [])

    supabase = get_supabase()
    result = (
        supabase.table("users")
        .select("id, username, display_name, avatar_url, status, identity_key_public, public_key")
        .ilike("username", f"{q}%")
        .neq("id", user["id"])
        .is_("deleted_at", "null")
        .limit(10)
        .execute()
    )

    users = [
        {
            "_id": row["id"],
            "username": row["username"],
            "displayName": row["display_name"],
            "avatarUrl": row.get("avatar_url", ""),
            "status": row.get("status"),
            "identityKeyPublic": row.get("identity_key_public", ""),
            "publicKey": row.get("public_key", ""),
        }
        for row in result.data or []
    ]
    return ApiResponse(200, "Search results", users)


async def get_me(user: dict | None) -> ApiResponse | dict:
    if not user:
        return {"status": "REGISTRATION_REQUIRED"}
    return ApiResponse(200, "Profile fetched.", user)


async def update_profile(user: dict, body) -> ApiResponse:
    if not user:
        raise ApiError(404, "Profile not found.")

    supabase = get_supabase()
    updates: dict = {}

    if body.display_name is not None and body.display_name.strip() != user.get("displayName"):
        trimmed = body.display_name.strip()
        if len(trimmed) < 1 or len(trimmed) > 50:
            raise ApiError(400, "Display name must be 1–50 characters.")
        wait = _days_until_unlock(user.get("lastDisplayNameChangeAt"), DISPLAY_NAME_LOCKOUT_DAYS)
        if wait > 0:
            raise ApiError(429, f"Wait {_pluralize_days(wait)} before changing your display name.")
        updates["display_name"] = trimmed
        updates["last_display_name_change_at"] = datetime.now(timezone.utc).isoformat()

    if body.username is not None and body.username.lower().strip() != user.get("username"):
        normalized = body.username.lower().strip()
        if len(normalized) < 3 or len(normalized) > 30:
            raise ApiError(400, "Username must be 3–30 characters.")
        if not re.match(r"^[a-z0-9_]+$", normalized):
            raise ApiError(400, "Username can only contain letters, numbers, and underscores.")
        wait = _days_until_unlock(user.get("lastUsernameChangeAt"), USERNAME_LOCKOUT_DAYS)
        if wait > 0:
            raise ApiError(429, f"Wait {_pluralize_days(wait)} before changing your username.")
        taken = (
            supabase.table("users")
            .select("id")
            .eq("username", normalized)
            .neq("id", user["id"])
            .maybe_single()
            .execute()
        )
        taken_data = getattr(taken, "data", None) if taken else None
        if taken_data:
            raise ApiError(409, "Username already taken.")
        updates["username"] = normalized
        updates["last_username_change_at"] = datetime.now(timezone.utc).isoformat()

    if body.avatar_url is not None and body.avatar_url != user.get("avatarUrl"):
        updates["avatar_url"] = body.avatar_url

    if not updates:
        return ApiResponse(200, "No changes.", user)

    result = supabase.table("users").update(updates).eq("id", user["id"]).execute()
    updated_user = serialize_user((result.data or [{}])[0])
    return ApiResponse(200, "Profile updated.", updated_user)


async def update_avatar(user: dict, image: str) -> ApiResponse:
    if not user:
        raise ApiError(404, "Profile not found.")
    if not image:
        raise ApiError(400, "No image provided.")

    upload_response = cloudinary.uploader.upload(
        image,
        folder="zync_avatars",
        transformation=[{"width": 512, "height": 512, "crop": "fill", "gravity": "auto"}],
        quality="auto:good",
    )

    if user.get("avatarPublicId"):
        try:
            cloudinary.uploader.destroy(user["avatarPublicId"])
        except Exception as exc:
            print(f"Failed to remove old avatar: {exc}")

    supabase = get_supabase()
    result = (
        supabase.table("users")
        .update({"avatar_url": upload_response["secure_url"], "avatar_public_id": upload_response["public_id"]})
        .eq("id", user["id"])
        .execute()
    )
    updated_user = serialize_user((result.data or [{}])[0])
    return ApiResponse(200, "Avatar updated.", updated_user)


async def update_public_key(user: dict, public_key: str) -> ApiResponse:
    if not public_key:
        raise ApiError(400, "Public key is required.")

    supabase = get_supabase()
    result = supabase.table("users").update({"public_key": public_key}).eq("id", user["id"]).execute()
    updated = serialize_user((result.data or [{}])[0])
    return ApiResponse(200, "Public key updated.", updated["publicKey"])


async def update_fcm_token(user: dict, fcm_token: str | None) -> ApiResponse:
    supabase = get_supabase()
    result = supabase.table("users").update({"fcm_token": fcm_token}).eq("id", user["id"]).execute()
    updated = serialize_user((result.data or [{}])[0])
    if not updated:
        raise ApiError(404, "User not found.")
    return ApiResponse(200, "FCM token updated.", {"fcmToken": updated.get("fcmToken")})
