from fastapi import APIRouter, Depends, Query, Request

from app.controllers import user_controller
from app.middleware.auth import authenticate_user, get_auth_context, get_current_user, require_user
from app.schemas.validators import (
    SetupProfileBody,
    UpdateAvatarBody,
    UpdateFCMTokenBody,
    UpdateProfileBody,
    UpdatePublicKeyBody,
)

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("/setup")
async def setup_profile(
    body: SetupProfileBody,
    request: Request,
    _=Depends(authenticate_user),
    auth_context=Depends(get_auth_context),
):
    result = await user_controller.setup_profile(auth_context, body)
    return result.model_dump()


@router.get("/search")
async def search_users(q: str | None = Query(default=None), user=Depends(require_user)):
    result = await user_controller.search_users(user, q)
    return result.model_dump()


@router.get("/me")
async def get_me(request: Request, _=Depends(authenticate_user)):
    result = await user_controller.get_me(get_current_user(request))
    if isinstance(result, dict) and "status" in result:
        return result
    return result.model_dump()


@router.patch("/profile")
async def update_profile(body: UpdateProfileBody, user=Depends(require_user)):
    result = await user_controller.update_profile(user, body)
    return result.model_dump()


@router.patch("/avatar")
async def update_avatar(body: UpdateAvatarBody, user=Depends(require_user)):
    result = await user_controller.update_avatar(user, body.image)
    return result.model_dump()


@router.post("/keys")
async def update_public_key(body: UpdatePublicKeyBody, user=Depends(require_user)):
    result = await user_controller.update_public_key(user, body.public_key)
    return result.model_dump()


@router.patch("/update-fcm")
async def update_fcm_token(body: UpdateFCMTokenBody, user=Depends(require_user)):
    result = await user_controller.update_fcm_token(user, body.fcm_token)
    return result.model_dump()
