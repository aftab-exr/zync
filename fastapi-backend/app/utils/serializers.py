import re
from typing import Any
from uuid import UUID

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def is_valid_uuid(value: str | None) -> bool:
    if not value:
        return False
    if UUID_REGEX.match(value):
        try:
            UUID(value)
            return True
        except ValueError:
            return False
    return False


def serialize_user(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "_id": row["id"],
        "id": row["id"],
        "firebaseUid": row.get("firebase_uid"),
        "email": row.get("email"),
        "emailVerified": row.get("email_verified", False),
        "isAI": row.get("is_ai", False),
        "provider": row.get("provider", "google"),
        "username": row.get("username"),
        "displayName": row.get("display_name"),
        "avatarUrl": row.get("avatar_url", ""),
        "avatarPublicId": row.get("avatar_public_id", ""),
        "publicKey": row.get("public_key", ""),
        "identityKeyPublic": row.get("identity_key_public", ""),
        "settings": row.get("settings"),
        "status": row.get("status"),
        "lastDisplayNameChangeAt": row.get("last_display_name_change_at"),
        "lastUsernameChangeAt": row.get("last_username_change_at"),
        "lastIp": row.get("last_ip"),
        "deletedAt": row.get("deleted_at"),
        "fcmToken": row.get("fcm_token"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


def serialize_message(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "_id": row["id"],
        "id": row["id"],
        "conversationId": row.get("conversation_id"),
        "senderId": row.get("sender_id"),
        "text": row.get("text", ""),
        "imageUrl": row.get("image_url", ""),
        "attachmentUrl": row.get("attachment_url", ""),
        "attachmentType": row.get("attachment_type", ""),
        "attachmentMime": row.get("attachment_mime", ""),
        "messageType": row.get("message_type", "text"),
        "ciphertextType": row.get("ciphertext_type", 1),
        "isRead": row.get("is_read", False),
        "deliveredAt": row.get("delivered_at"),
        "readAt": row.get("read_at"),
        "isEdited": row.get("is_edited", False),
        "deletedForEveryone": row.get("deleted_for_everyone", False),
        "deletedForMe": row.get("deleted_for_me", []),
        "deletedFor": row.get("deleted_for", ""),
        "deletedAt": row.get("deleted_at"),
        "replyToId": row.get("reply_to_id"),
        "flaggedAt": row.get("flagged_at"),
        "expiresAt": row.get("expires_at"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


def serialize_conversation(row: dict[str, Any], participants: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    payload = {
        "_id": row["id"],
        "id": row["id"],
        "type": row.get("type", "dm"),
        "participants": participants if participants is not None else row.get("participants", []),
        "dmParticipants": row.get("dm_participants", []),
        "lastMessageAt": row.get("last_message_at"),
        "lastMessageId": row.get("last_message_id"),
        "messageCount": row.get("message_count", 0),
        "isGroup": row.get("is_group", False),
        "groupName": row.get("group_name"),
        "groupAvatar": row.get("group_avatar", ""),
        "groupAdmins": row.get("group_admins", []),
        "groupId": row.get("group_id"),
        "encryptedGroupKeys": row.get("encrypted_group_keys", []),
        "communityId": row.get("community_id"),
        "disappearAfter": row.get("disappear_after"),
        "deletedAt": row.get("deleted_at"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }
    return payload


def serialize_device(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "_id": row["id"],
        "id": row["id"],
        "deviceName": row.get("device_name"),
        "deviceType": row.get("device_type"),
        "lastUsedAt": row.get("last_used_at"),
        "ipAddress": row.get("ip_address"),
        "userAgent": row.get("user_agent"),
        "createdAt": row.get("created_at"),
    }
