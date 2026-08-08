from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.controllers import message_controller
from app.middleware.auth import require_user
from app.middleware.rate_limit import message_send_rate_limit
from app.schemas.validators import EditMessageBody, SendMessageBody

router = APIRouter(prefix="/api/v1/messages", tags=["messages"])


@router.post("/upload")
async def upload_attachment(file: UploadFile = File(...), user=Depends(require_user)):
    content = await file.read()
    result = await message_controller.upload_attachment(content)
    return result.model_dump()


@router.delete("/clear")
async def clear_messages(user=Depends(require_user)):
    result = await message_controller.clear_messages(user)
    return result.model_dump()


@router.get("/{conversation_id}")
async def get_messages(conversation_id: str, user=Depends(require_user)):
    result = await message_controller.get_messages(user, conversation_id)
    return result.model_dump()


@router.post("/{conversation_id}")
async def send_message(
    conversation_id: str,
    body: SendMessageBody,
    request: Request,
    user=Depends(require_user),
):
    await message_send_rate_limit(request)
    result = await message_controller.send_message(user, conversation_id, body)
    return result.model_dump()


@router.put("/{message_id}/edit")
async def edit_message(message_id: str, body: EditMessageBody, user=Depends(require_user)):
    result = await message_controller.edit_message(user, message_id, body.text)
    return result.model_dump()


@router.delete("/{message_id}/everyone")
async def delete_message_for_everyone(message_id: str, user=Depends(require_user)):
    result = await message_controller.delete_message_for_everyone(user, message_id)
    return result.model_dump()


@router.delete("/{message_id}/me")
async def delete_message_for_me(message_id: str, user=Depends(require_user)):
    result = await message_controller.delete_message_for_me(user, message_id)
    return result.model_dump()
