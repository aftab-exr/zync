from fastapi import APIRouter, Depends

from app.controllers import conversation_controller
from app.middleware.auth import require_user
from app.schemas.validators import CreateConversationBody, CreateGroupConversationBody

router = APIRouter(prefix="/api/v1/conversations", tags=["conversations"], dependencies=[Depends(require_user)])


@router.get("/")
async def get_conversations(user=Depends(require_user)):
    result = await conversation_controller.get_conversations(user)
    return result.model_dump()


@router.post("/")
async def create_conversation(body: CreateConversationBody, user=Depends(require_user)):
    result = await conversation_controller.create_conversation(user, body.receiver_id)
    return result.model_dump()


@router.post("/group")
async def create_group_conversation(body: CreateGroupConversationBody, user=Depends(require_user)):
    result = await conversation_controller.create_group_conversation(user, body)
    return result.model_dump()
