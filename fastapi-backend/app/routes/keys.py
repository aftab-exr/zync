from fastapi import APIRouter, Depends

from app.controllers import key_controller
from app.middleware.auth import require_user
from app.schemas.validators import RegisterKeyBundleBody, ReplenishPreKeysBody

router = APIRouter(prefix="/api/v1/keys", tags=["keys"], dependencies=[Depends(require_user)])


@router.post("/register")
async def register_key_bundle(body: RegisterKeyBundleBody, user=Depends(require_user)):
    result = await key_controller.register_key_bundle(user, body)
    return result.model_dump()


@router.get("/{user_id}")
async def get_key_bundle(user_id: str, user=Depends(require_user)):
    result = await key_controller.get_key_bundle(user_id)
    return result.model_dump()


@router.post("/prekeys")
async def replenish_pre_keys(body: ReplenishPreKeysBody, user=Depends(require_user)):
    result = await key_controller.replenish_pre_keys(user, body)
    return result.model_dump()
