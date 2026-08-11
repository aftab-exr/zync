from app.config.supabase import get_supabase
from app.utils.api_error import ApiError
from app.utils.api_response import ApiResponse


async def register_key_bundle(user: dict, body) -> ApiResponse:
    supabase = get_supabase()
    user_id = user["id"]
    one_time_pre_keys = [pk.model_dump(by_alias=True) for pk in body.one_time_pre_keys]

    payload = {
        "user_id": user_id,
        "identity_key": body.identity_key.model_dump(by_alias=True),
        "signed_pre_key": body.signed_pre_key.model_dump(by_alias=True),
        "one_time_pre_keys": one_time_pre_keys,
        "one_time_pre_key_count": len(one_time_pre_keys),
    }

    existing = supabase.table("key_bundles").select("id").eq("user_id", user_id).maybe_single().execute()
    existing_data = getattr(existing, "data", None) if existing else None
    if existing_data:
        result = supabase.table("key_bundles").update(payload).eq("user_id", user_id).execute()
    else:
        result = supabase.table("key_bundles").insert(payload).execute()

    public_key = body.identity_key.public_key
    supabase.table("users").update(
        {"identity_key_public": public_key, "public_key": public_key}
    ).eq("id", user_id).execute()

    key_doc = (result.data or [{}])[0]
    return ApiResponse(200, "Key bundle registered successfully", key_doc)


async def get_key_bundle(user_id: str) -> ApiResponse:
    supabase = get_supabase()
    result = supabase.table("key_bundles").select("*").eq("user_id", user_id).maybe_single().execute()
    key_doc = getattr(result, "data", None) if result else None
    if not key_doc:
        raise ApiError(404, "Key bundle not found for user")

    consumed_result = supabase.rpc("consume_one_time_prekey", {"p_user_id": user_id}).execute()
    rpc_data = consumed_result.data or {}
    consumed = rpc_data.get("consumed")
    remaining = rpc_data.get("remaining", max(0, key_doc.get("one_time_pre_key_count", 0) - (1 if consumed else 0)))

    return ApiResponse(
        200,
        "Key bundle retrieved",
        {
            "userId": key_doc["user_id"],
            "identityKey": key_doc["identity_key"],
            "signedPreKey": {
                "keyId": key_doc["signed_pre_key"]["keyId"],
                "publicKey": key_doc["signed_pre_key"]["publicKey"],
            },
            "oneTimePreKey": consumed,
            "remainingOneTimePreKeys": remaining,
        },
    )


async def replenish_pre_keys(user: dict, body) -> ApiResponse:
    supabase = get_supabase()
    user_id = user["id"]
    pre_keys = [pk.model_dump(by_alias=True) for pk in body.pre_keys]

    existing = supabase.table("key_bundles").select("*").eq("user_id", user_id).maybe_single().execute()
    existing_data = getattr(existing, "data", None) if existing else None
    if not existing_data:
        raise ApiError(404, "Key bundle not found for user")

    current_keys = existing_data.get("one_time_pre_keys") or []
    updated_keys = current_keys + pre_keys
    new_count = existing_data.get("one_time_pre_key_count", 0) + len(pre_keys)

    supabase.table("key_bundles").update(
        {"one_time_pre_keys": updated_keys, "one_time_pre_key_count": new_count}
    ).eq("user_id", user_id).execute()

    return ApiResponse(200, "One-time pre-keys replenished", {"oneTimePreKeyCount": new_count})
