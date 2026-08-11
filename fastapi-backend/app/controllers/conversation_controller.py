from datetime import datetime, timezone

from app.config.supabase import get_supabase
from app.utils.api_error import ApiError
from app.utils.api_response import ApiResponse
from app.utils.serializers import is_valid_uuid, serialize_conversation, serialize_user


def _participant_fields() -> str:
    return "id, username, display_name, avatar_url, is_ai, status, public_key"


async def _populate_participants(participant_ids: list[str]) -> list[dict]:
    if not participant_ids:
        return []
    supabase = get_supabase()
    result = supabase.table("users").select(_participant_fields()).in_("id", participant_ids).execute()
    by_id = {row["id"]: serialize_user(row) for row in result.data or []}
    return [by_id[pid] for pid in participant_ids if pid in by_id]


async def get_conversations(user: dict) -> ApiResponse:
    user_id = user.get("id")
    if not user_id or not is_valid_uuid(user_id):
        raise ApiError(400, "Invalid user session.")

    supabase = get_supabase()
    result = (
        supabase.table("conversations")
        .select("*")
        .contains("participants", [user_id])
        .is_("deleted_at", "null")
        .order("last_message_at", desc=True)
        .execute()
    )

    conversations = []
    for row in result.data or []:
        participants = await _populate_participants(row.get("participants") or [])
        conversations.append(serialize_conversation(row, participants))

    return ApiResponse(200, "Conversations fetched.", conversations)


async def create_conversation(user: dict, receiver_id: str) -> ApiResponse:
    sender_id = user.get("id")
    if not sender_id or not is_valid_uuid(sender_id):
        raise ApiError(400, "Invalid sender session.")
    if not receiver_id or not is_valid_uuid(receiver_id):
        raise ApiError(400, "Invalid receiver ID.")
    if sender_id == receiver_id:
        raise ApiError(400, "Cannot create conversation with yourself.")

    supabase = get_supabase()
    receiver_result = (
        supabase.table("users").select("id").eq("id", receiver_id).is_("deleted_at", "null").maybe_single().execute()
    )
    receiver_data = getattr(receiver_result, "data", None) if receiver_result else None
    if not receiver_data:
        raise ApiError(404, "Receiver not found.")

    existing = (
        supabase.table("conversations")
        .select("*")
        .eq("is_group", False)
        .contains("participants", [sender_id])
        .contains("participants", [receiver_id])
        .maybe_single()
        .execute()
    )

    existing_data = getattr(existing, "data", None) if existing else None
    if existing_data:
        conversation = existing_data
    else:
        insert_result = (
            supabase.table("conversations")
            .insert({"participants": [sender_id, receiver_id], "is_group": False, "type": "dm"})
            .execute()
        )
        conversation = (insert_result.data or [{}])[0]

    participants = await _populate_participants(conversation.get("participants") or [])
    return ApiResponse(201, "Conversation ready.", serialize_conversation(conversation, participants))


async def create_group_conversation(user: dict, body) -> ApiResponse:
    creator_id = user.get("id")
    if not creator_id or not is_valid_uuid(creator_id):
        raise ApiError(400, "Invalid session.")

    trimmed_name = body.name.strip()
    if not trimmed_name:
        raise ApiError(400, "Group name is required.")
    if len(trimmed_name) > 50:
        raise ApiError(400, "Group name must be 50 characters or less.")

    all_participants = list({*body.participant_ids, creator_id})
    supabase = get_supabase()

    valid_result = (
        supabase.table("users").select("id").in_("id", all_participants).is_("deleted_at", "null").execute()
    )
    if len(valid_result.data or []) != len(all_participants):
        raise ApiError(400, "One or more participants are invalid.")

    sanitized_keys = []
    if body.encrypted_group_keys:
        for key in body.encrypted_group_keys:
            if is_valid_uuid(key.user_id) and isinstance(key.encrypted_key_payload, str):
                sanitized_keys.append(
                    {"userId": key.user_id, "encryptedKeyPayload": key.encrypted_key_payload}
                )

    insert_result = (
        supabase.table("conversations")
        .insert(
            {
                "is_group": True,
                "type": "group",
                "group_name": trimmed_name,
                "participants": all_participants,
                "group_admins": [creator_id],
                "encrypted_group_keys": sanitized_keys,
            }
        )
        .execute()
    )
    group = (insert_result.data or [{}])[0]
    participants = await _populate_participants(group.get("participants") or [])
    return ApiResponse(201, "Group created.", serialize_conversation(group, participants))
