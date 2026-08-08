from fastapi import APIRouter, Depends, File, Request, Response, UploadFile

from app.controllers import auth_controller, conversation_controller, key_controller, message_controller, user_controller
from app.middleware.auth import authenticate_user, get_auth_context, get_current_user, require_user
from app.middleware.rate_limit import message_send_rate_limit
from app.schemas.validators import LoginBody

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    result = await auth_controller.login(request, response, body.firebase_id_token)
    return result.model_dump()


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    result = await auth_controller.refresh(request, response)
    return result.model_dump()


@router.post("/logout")
async def logout(request: Request, response: Response):
    result = await auth_controller.logout(request, response)
    return result.model_dump()


@router.get("/devices")
async def get_devices(user=Depends(require_user)):
    result = await auth_controller.get_devices(user)
    return result.model_dump()


@router.delete("/devices/{device_id}")
async def revoke_device(device_id: str, user=Depends(require_user)):
    result = await auth_controller.revoke_device(user, device_id)
    return result.model_dump()
