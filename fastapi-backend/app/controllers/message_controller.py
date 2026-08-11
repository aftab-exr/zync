import asyncio
import io
import logging
from datetime import datetime, timezone

import cloudinary.uploader
from firebase_admin import messaging

from app.config.firebase import get_firebase_app
from app.config.supabase import get_supabase
from app.constants.constants import MESSAGE_EDIT_WINDOW_MS
from app.services.ai_service import generate_ai_response
from app.socket.socket_manager import get_io
from app.utils.api_error import ApiError
from app.utils.api_response import ApiResponse
from app.utils.serializers import is_valid_uuid, serialize_message

logger = logging.getLogger(__name__)


async def _send_silent_push(token: str | None, sender_name: str, ciphertext: str, conversation_id: str) -> None:
    if not token:
        return
    try:
        get_firebase_app()
        await asyncio.to_thread(
            messaging.send,
            messaging.Message(
                data={
                    "senderName": sender_name,
                    "ciphertext": ciphertext or "",
                    "conversationId": conversation_id or "",
                },
                token=token,
            )
        )
    except Exception as exc:
        logger.error("Failed to send silent push notification: %s", exc)


async def get_messages(user: dict, conversation_id: str) -> ApiResponse:
    user_id = user.get("id")
    if not user_id or not is_valid_uuid(user_id):
        raise ApiError(401, "Unauthorized")
    if not conversation_id or not is_valid_uuid(conversation_id):
        raise ApiError(400, "Invalid conversation ID format.")

    supabase = get_supabase()
    conversation_result = supabase.table("conversations").select("*").eq("id", conversation_id).maybe_single().execute()
    conversation = getattr(conversation_result, "data", None) if conversation_result else None
    if not conversation:
        raise ApiError(404, "Conversation not found")

    if user_id not in (conversation.get("participants") or []):
        raise ApiError(403, "You are not authorized to view messages in this conversation")

    messages_result = (
        supabase.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )

    filtered = [
        row
        for row in messages_result.data or []
        if user_id not in (row.get("deleted_for_me") or [])
    ]
    chronological = list(reversed(filtered))
    serialized = [serialize_message(row) for row in chronological]
    return ApiResponse(200, "Messages fetched successfully", serialized)


async def clear_messages(user: dict) -> ApiResponse:
    user_id = user.get("id")
    if not user_id or not is_valid_uuid(user_id):
        raise ApiError(401, "Unauthorized")

    supabase = get_supabase()
    conversations_result = supabase.table("conversations").select("id").contains("participants", [user_id]).execute()
    conversation_ids = [row["id"] for row in conversations_result.data or []]

    if not conversation_ids:
        return ApiResponse(200, "No messages to clear.", {"deletedCount": 0})

    deleted_count = 0
    for conversation_id in conversation_ids:
        messages_result = supabase.table("messages").select("id").eq("conversation_id", conversation_id).execute()
        message_ids = [row["id"] for row in messages_result.data or []]
        if message_ids:
            supabase.table("messages").delete().in_("id", message_ids).execute()
            deleted_count += len(message_ids)

    for conversation_id in conversation_ids:
        supabase.table("conversations").update({"last_message_id": None}).eq("id", conversation_id).execute()

    return ApiResponse(200, "Chat history cleared successfully.", {"deletedCount": deleted_count})


async def upload_attachment(file_bytes: bytes) -> ApiResponse:
    if not file_bytes:
        raise ApiError(400, "No file provided.")

    upload_response = await asyncio.to_thread(
        cloudinary.uploader.upload,
        io.BytesIO(file_bytes),
        resource_type="raw",
        folder="zync_secure_media",
    )
    return ApiResponse(200, "File uploaded successfully", {"url": upload_response["secure_url"]})


async def send_message(user: dict, conversation_id: str, body) -> ApiResponse:
    sender_id = user.get("id")
    if not sender_id or not is_valid_uuid(sender_id):
        raise ApiError(401, "Unauthorized")
    if not conversation_id or not is_valid_uuid(conversation_id):
        raise ApiError(400, "Conversation ID is missing or invalid.")

    has_text = isinstance(body.text, str) and body.text.strip()
    if not has_text and not body.image and not body.attachment_url:
        raise ApiError(400, "Message must contain text, an image, or an attachment.")

    supabase = get_supabase()
    conversation_result = supabase.table("conversations").select("*").eq("id", conversation_id).maybe_single().execute()
    conversation = getattr(conversation_result, "data", None) if conversation_result else None
    if not conversation:
        raise ApiError(404, "Conversation not found")
    if sender_id not in (conversation.get("participants") or []):
        raise ApiError(403, "You are not authorized to send messages")

    image_url = ""
    if body.image:
        upload_response = await asyncio.to_thread(cloudinary.uploader.upload, body.image, folder="zync_messages")
        image_url = upload_response["secure_url"]

    message_result = (
        supabase.table("messages")
        .insert(
            {
                "conversation_id": conversation_id,
                "sender_id": sender_id,
                "text": body.text.strip() if body.text else "",
                "image_url": image_url,
                "attachment_url": body.attachment_url or "",
                "attachment_type": body.attachment_type or "",
                "attachment_mime": body.attachment_mime or "",
            }
        )
        .execute()
    )
    new_message_row = (message_result.data or [{}])[0]
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("conversations").update(
        {"last_message_at": now, "last_message_id": new_message_row["id"]}
    ).eq("id", conversation_id).execute()

    other_participant_ids = [pid for pid in conversation.get("participants") or [] if pid != sender_id]
    receivers_result = supabase.table("users").select("*").in_("id", other_participant_ids).execute()
    receivers = receivers_result.data or []
    io = get_io()
    new_message = serialize_message(new_message_row)

    for receiver in receivers:
        if receiver.get("is_ai"):
            plain_text_prompt = body.text or ""
            if body.image:
                plain_text_prompt += "\n[User also attached an image payload]"

            ai_response_text = await generate_ai_response(plain_text_prompt)
            ai_message_result = (
                supabase.table("messages")
                .insert(
                    {
                        "sender_id": receiver["id"],
                        "conversation_id": conversation_id,
                        "text": ai_response_text,
                        "image_url": "",
                    }
                )
                .execute()
            )
            ai_message_row = (ai_message_result.data or [{}])[0]
            supabase.table("conversations").update(
                {"last_message_at": datetime.now(timezone.utc).isoformat(), "last_message_id": ai_message_row["id"]}
            ).eq("id", conversation_id).execute()

            ai_payload = serialize_message(ai_message_row)
            if io:
                await io.emit("newMessage", ai_payload, room=sender_id)

            if user.get("fcmToken"):
                await _send_silent_push(
                    user["fcmToken"],
                    receiver.get("display_name") or receiver.get("username") or "AI Assistant",
                    ai_message_row.get("text", ""),
                    conversation_id,
                )
        else:
            if io:
                await io.emit("newMessage", new_message, room=receiver["id"])
            if receiver.get("fcm_token"):
                await _send_silent_push(
                    receiver["fcm_token"],
                    user.get("displayName") or user.get("username") or "Someone",
                    new_message_row.get("text", ""),
                    conversation_id,
                )

    return ApiResponse(201, "Message sent successfully", new_message)


async def edit_message(user: dict, message_id: str, text: str) -> ApiResponse:
    user_id = user.get("id")
    if not user_id or not is_valid_uuid(user_id):
        raise ApiError(401, "Unauthorized")
    if not message_id or not is_valid_uuid(message_id):
        raise ApiError(400, "Invalid message ID format.")

    supabase = get_supabase()
    message_result = supabase.table("messages").select("*").eq("id", message_id).maybe_single().execute()
    message = getattr(message_result, "data", None) if message_result else None
    if not message:
        raise ApiError(404, "Message not found")
    if message["sender_id"] != user_id:
        raise ApiError(403, "You can only edit your own messages")

    created_at = datetime.fromisoformat(message["created_at"].replace("Z", "+00:00"))
    if (datetime.now(timezone.utc) - created_at).total_seconds() * 1000 >= MESSAGE_EDIT_WINDOW_MS:
        raise ApiError(403, "Message cannot be edited after the edit window has elapsed")

    update_result = (
        supabase.table("messages")
        .update({"text": text.strip(), "is_edited": True})
        .eq("id", message_id)
        .execute()
    )
    updated = serialize_message((update_result.data or [{}])[0])

    conversation_result = (
        supabase.table("conversations").select("participants").eq("id", message["conversation_id"]).maybe_single().execute()
    )
    conversation = getattr(conversation_result, "data", None) if conversation_result else None
    io = get_io()
    if conversation and io:
        for participant_id in conversation.get("participants") or []:
            await io.emit(
                "message:edited",
                {
                    "_id": updated["id"],
                    "conversationId": updated["conversationId"],
                    "text": updated["text"],
                    "isEdited": True,
                    "updatedAt": updated["updatedAt"],
                },
                room=participant_id,
            )

    return ApiResponse(200, "Message edited successfully", updated)


async def delete_message_for_everyone(user: dict, message_id: str) -> ApiResponse:
    user_id = user.get("id")
    if not user_id or not is_valid_uuid(user_id):
        raise ApiError(401, "Unauthorized")
    if not message_id or not is_valid_uuid(message_id):
        raise ApiError(400, "Invalid message ID format.")

    supabase = get_supabase()
    message_result = supabase.table("messages").select("*").eq("id", message_id).maybe_single().execute()
    message = getattr(message_result, "data", None) if message_result else None
    if not message:
        raise ApiError(404, "Message not found")
    if message["sender_id"] != user_id:
        raise ApiError(403, "You can only delete your own messages")

    update_result = (
        supabase.table("messages")
        .update(
            {
                "text": "",
                "image_url": "",
                "attachment_url": "",
                "attachment_type": "",
                "attachment_mime": "",
                "deleted_for_everyone": True,
            }
        )
        .eq("id", message_id)
        .execute()
    )
    updated = serialize_message((update_result.data or [{}])[0])

    conversation_result = (
        supabase.table("conversations").select("participants").eq("id", message["conversation_id"]).maybe_single().execute()
    )
    conversation = getattr(conversation_result, "data", None) if conversation_result else None
    io = get_io()
    if conversation and io:
        for participant_id in conversation.get("participants") or []:
            await io.emit(
                "message:deletedForEveryone",
                {
                    "_id": updated["id"],
                    "conversationId": updated["conversationId"],
                    "deletedForEveryone": True,
                    "updatedAt": updated["updatedAt"],
                },
                room=participant_id,
            )

    return ApiResponse(200, "Message deleted for everyone", updated)


async def delete_message_for_me(user: dict, message_id: str) -> ApiResponse:
    user_id = user.get("id")
    if not user_id or not is_valid_uuid(user_id):
        raise ApiError(401, "Unauthorized")
    if not message_id or not is_valid_uuid(message_id):
        raise ApiError(400, "Invalid message ID format.")

    supabase = get_supabase()
    message_result = supabase.table("messages").select("*").eq("id", message_id).maybe_single().execute()
    message = getattr(message_result, "data", None) if message_result else None
    if not message:
        raise ApiError(404, "Message not found")

    conversation_result = (
        supabase.table("conversations").select("*").eq("id", message["conversation_id"]).maybe_single().execute()
    )
    conversation = getattr(conversation_result, "data", None) if conversation_result else None
    if not conversation:
        raise ApiError(404, "Conversation not found")
    if user_id not in (conversation.get("participants") or []):
        raise ApiError(403, "You are not authorized to access this message")

    deleted_for_me = message.get("deleted_for_me") or []
    if user_id not in deleted_for_me:
        deleted_for_me.append(user_id)
        supabase.table("messages").update({"deleted_for_me": deleted_for_me}).eq("id", message_id).execute()
        message["deleted_for_me"] = deleted_for_me

    io = get_io()
    if io:
        await io.emit(
            "message:deletedForMe",
            {"_id": message_id, "conversationId": message["conversation_id"]},
            room=user_id,
        )

    return ApiResponse(200, "Message deleted for you", serialize_message(message))
