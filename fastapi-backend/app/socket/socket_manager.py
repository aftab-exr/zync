import logging
from datetime import datetime, timezone
from typing import Any

import jwt
import socketio
from firebase_admin import auth as firebase_auth

from app.config.env import get_settings
from app.config.supabase import get_supabase
from app.services.rate_limiter import check_rate_limit, init_redis_rate_limiter
from app.utils.serializers import serialize_message

logger = logging.getLogger(__name__)

_sio: socketio.AsyncServer | None = None
_active_calls: dict[str, dict[str, Any]] = {}


def get_io() -> socketio.AsyncServer | None:
    return _sio


async def _log_call_and_emit(session: dict[str, Any], duration: int) -> None:
    try:
        caller_id = session["callerId"]
        receiver_id = session["receiverId"]
        call_type = session["callType"]
        status = session["status"]
        supabase = get_supabase()

        existing = (
            supabase.table("conversations")
            .select("*")
            .eq("is_group", False)
            .contains("participants", [caller_id])
            .contains("participants", [receiver_id])
            .maybe_single()
            .execute()
        )
        conversation = existing.data
        if not conversation:
            insert_result = (
                supabase.table("conversations")
                .insert({"is_group": False, "participants": [caller_id, receiver_id], "type": "dm"})
                .execute()
            )
            conversation = (insert_result.data or [{}])[0]

        if status == "missed":
            text = f"🔴 Missed {call_type} call"
        else:
            mins = max(1, round(duration / 60))
            text = f"📞 {call_type.capitalize()} call - {mins} mins"

        message_result = (
            supabase.table("messages")
            .insert(
                {
                    "conversation_id": conversation["id"],
                    "sender_id": caller_id,
                    "text": text,
                    "message_type": "call_log",
                }
            )
            .execute()
        )
        new_message = (message_result.data or [{}])[0]
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("conversations").update(
            {"last_message_at": now, "last_message_id": new_message["id"]}
        ).eq("id", conversation["id"]).execute()

        if _sio:
            payload = serialize_message(new_message)
            await _sio.emit("newMessage", payload, room=caller_id)
            await _sio.emit("newMessage", payload, room=receiver_id)
    except Exception as exc:
        logger.error("Error logging call and emitting message: %s", exc)


async def _socket_rate_limit(sid: str, key: str, limit: int, window_ms: int) -> bool:
    result = await check_rate_limit(key=key, limit=limit, window_ms=window_ms)
    return result["allowed"]


def create_socket_app() -> socketio.ASGIApp:
    global _sio
    settings = get_settings()
    init_redis_rate_limiter()

    client_mgr = None
    if settings.redis_url:
        client_mgr = socketio.AsyncRedisManager(settings.redis_url)

    _sio = socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins="*",
        client_manager=client_mgr,
    )

    @_sio.event
    async def connect(sid, environ, auth):
        token = (auth or {}).get("token") if auth else None
        if not token:
            return False

        try:
            decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return False
        except jwt.InvalidTokenError:
            return False

        supabase = get_supabase()
        user_result = supabase.table("users").select("*").eq("id", decoded.get("sub")).maybe_single().execute()
        if not user_result.data:
            return False

        await _sio.save_session(sid, {"user": user_result.data})
        await _sio.enter_room(sid, user_result.data["id"])
        await _sio.emit(
            "presence:update",
            {"userId": user_result.data["id"], "online": True},
            skip_sid=sid,
        )
        supabase.table("users").update({"status": {"online": True, "lastSeen": None}}).eq(
            "id", user_result.data["id"]
        ).execute()

    @_sio.on("typing_start")
    async def typing_start(sid, data):
        session = await _sio.get_session(sid)
        user = session.get("user")
        if not user:
            return
        if not await _socket_rate_limit(sid, f"user:{user['id']}:typing", 10, 1000):
            return
        receiver_id = data.get("receiverId")
        conversation_id = data.get("conversationId")
        if receiver_id:
            await _sio.emit("user_typing", {"conversationId": conversation_id}, room=receiver_id)

    @_sio.on("typing_end")
    async def typing_end(sid, data):
        session = await _sio.get_session(sid)
        user = session.get("user")
        if not user:
            return
        receiver_id = data.get("receiverId")
        conversation_id = data.get("conversationId")
        if receiver_id:
            await _sio.emit("user_stopped_typing", {"conversationId": conversation_id}, room=receiver_id)

    @_sio.on("message:mark-read")
    async def message_mark_read(sid, data):
        session = await _sio.get_session(sid)
        user = session.get("user")
        if not user:
            return
        conversation_id = data.get("conversationId")
        message_ids = data.get("messageIds") or []
        if not conversation_id or not message_ids:
            return

        reader_id = user["id"]
        supabase = get_supabase()
        for message_id in message_ids:
            msg_result = supabase.table("messages").select("*").eq("id", message_id).maybe_single().execute()
            msg = msg_result.data
            if msg and msg.get("sender_id") != reader_id and not msg.get("is_read"):
                supabase.table("messages").update({"is_read": True}).eq("id", message_id).execute()

        sender_ids = set()
        for message_id in message_ids:
            msg_result = supabase.table("messages").select("sender_id").eq("id", message_id).maybe_single().execute()
            if msg_result.data:
                sender_id = msg_result.data.get("sender_id")
                if sender_id and sender_id != reader_id:
                    sender_ids.add(sender_id)

        for sender_id in sender_ids:
            await _sio.emit(
                "message:read",
                {"conversationId": conversation_id, "messageIds": message_ids, "readerId": reader_id},
                room=sender_id,
            )

    @_sio.on("webrtc:call-user")
    async def webrtc_call_user(sid, data):
        session = await _sio.get_session(sid)
        user = session.get("user")
        if not user:
            return
        if not await _socket_rate_limit(sid, f"user:{user['id']}:webrtc", 20, 1000):
            return

        user_id = user["id"]
        user_to_call = str(data.get("userToCall"))
        call_type = "audio" if data.get("callType") == "audio" else "video"
        session_data = {
            "callerId": user_id,
            "receiverId": user_to_call,
            "callType": call_type,
            "status": "missed",
            "startTime": None,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        _active_calls[user_id] = session_data
        _active_calls[user_to_call] = session_data

        await _sio.emit(
            "webrtc:incoming-call",
            {
                "signal": data.get("signalData"),
                "callType": call_type,
                "caller": {"_id": user_id, **(data.get("callerData") or {})},
            },
            room=user_to_call,
        )

    @_sio.on("webrtc:answer-call")
    async def webrtc_answer_call(sid, data):
        session = await _sio.get_session(sid)
        user = session.get("user")
        if not user:
            return
        call_session = _active_calls.get(user["id"])
        if call_session:
            call_session["startTime"] = int(datetime.now(timezone.utc).timestamp() * 1000)
            call_session["status"] = "answered"
        to_user = str(data.get("to"))
        await _sio.emit("webrtc:call-accepted", data.get("signalData"), room=to_user)

    @_sio.on("webrtc:ice-candidate")
    async def webrtc_ice_candidate(sid, data):
        session = await _sio.get_session(sid)
        user = session.get("user")
        if not user:
            return
        to_user = str(data.get("to"))
        await _sio.emit(
            "webrtc:ice-candidate",
            {"senderId": user["id"], "candidate": data.get("candidate")},
            room=to_user,
        )

    @_sio.on("webrtc:reject-call")
    async def webrtc_reject_call(sid, data):
        session = await _sio.get_session(sid)
        user = session.get("user")
        if not user:
            return
        call_session = _active_calls.get(user["id"])
        if call_session:
            _active_calls.pop(call_session["callerId"], None)
            _active_calls.pop(call_session["receiverId"], None)
            await _log_call_and_emit(call_session, 0)
        to_user = str(data.get("to"))
        await _sio.emit("webrtc:call-rejected", room=to_user)

    @_sio.on("webrtc:end-call")
    async def webrtc_end_call(sid, data):
        session = await _sio.get_session(sid)
        user = session.get("user")
        if not user:
            return
        call_session = _active_calls.get(user["id"])
        if call_session:
            _active_calls.pop(call_session["callerId"], None)
            _active_calls.pop(call_session["receiverId"], None)
            duration = 0
            if call_session.get("startTime"):
                duration = int(datetime.now(timezone.utc).timestamp() * 1000 - call_session["startTime"]) // 1000
            await _log_call_and_emit(call_session, duration)
        to_user = str(data.get("to"))
        await _sio.emit("webrtc:call-ended", room=to_user)

    @_sio.event
    async def disconnect(sid):
        session = await _sio.get_session(sid)
        user = session.get("user") if session else None
        if not user:
            return
        user_id = user["id"]
        call_session = _active_calls.get(user_id)
        if call_session:
            _active_calls.pop(call_session["callerId"], None)
            _active_calls.pop(call_session["receiverId"], None)
            duration = 0
            if call_session.get("startTime"):
                duration = int(datetime.now(timezone.utc).timestamp() * 1000 - call_session["startTime"]) // 1000
            await _log_call_and_emit(call_session, duration)
            peer_id = call_session["callerId"] if call_session["callerId"] == user_id else call_session["receiverId"]
            await _sio.emit("webrtc:call-ended", room=peer_id)

        supabase = get_supabase()
        last_seen = datetime.now(timezone.utc).isoformat()
        supabase.table("users").update({"status": {"online": False, "lastSeen": last_seen}}).eq("id", user_id).execute()
        await _sio.emit("presence:update", {"userId": user_id, "online": False, "lastSeen": last_seen}, skip_sid=sid)

    return socketio.ASGIApp(_sio)
