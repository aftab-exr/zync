import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def validate_uuid(value: str) -> str:
    if not UUID_PATTERN.match(value):
        raise ValueError("Invalid UUID format")
    return value


class LoginBody(BaseModel):
    firebase_id_token: str = Field(..., alias="firebaseIdToken", min_length=1)

    model_config = {"populate_by_name": True}


class SetupProfileBody(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    display_name: str = Field(..., alias="displayName", min_length=1, max_length=50)
    avatar_url: str | None = Field(default="", alias="avatarUrl")

    model_config = {"populate_by_name": True}

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not re.match(r"^[a-z0-9_]+$", value, re.IGNORECASE):
            raise ValueError("Username can only contain letters, numbers, and underscores.")
        return value


class UpdateProfileBody(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=30)
    display_name: str | None = Field(default=None, alias="displayName", min_length=1, max_length=50)
    avatar_url: str | None = Field(default=None, alias="avatarUrl")

    model_config = {"populate_by_name": True}

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        if value is not None and not re.match(r"^[a-z0-9_]+$", value, re.IGNORECASE):
            raise ValueError("Username can only contain letters, numbers, and underscores.")
        return value


class UpdatePublicKeyBody(BaseModel):
    public_key: str = Field(..., alias="publicKey", min_length=1)

    model_config = {"populate_by_name": True}


class UpdateFCMTokenBody(BaseModel):
    fcm_token: str | None = Field(default=None, alias="fcmToken")

    model_config = {"populate_by_name": True}


class CreateConversationBody(BaseModel):
    receiver_id: str = Field(..., alias="receiverId")

    model_config = {"populate_by_name": True}

    @field_validator("receiver_id")
    @classmethod
    def validate_receiver_id(cls, value: str) -> str:
        return validate_uuid(value)


class EncryptedGroupKey(BaseModel):
    user_id: str = Field(..., alias="userId")
    encrypted_key_payload: str = Field(..., alias="encryptedKeyPayload")

    model_config = {"populate_by_name": True}

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, value: str) -> str:
        return validate_uuid(value)


class CreateGroupConversationBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    participant_ids: list[str] = Field(..., alias="participantIds", min_length=1)
    encrypted_group_keys: list[EncryptedGroupKey] | None = Field(default=None, alias="encryptedGroupKeys")

    model_config = {"populate_by_name": True}

    @field_validator("participant_ids")
    @classmethod
    def validate_participant_ids(cls, value: list[str]) -> list[str]:
        return [validate_uuid(v) for v in value]


class SendMessageBody(BaseModel):
    text: str | None = Field(default=None, max_length=2000)
    image: str | None = None
    attachment_url: str | None = Field(default=None, alias="attachmentUrl")
    attachment_type: Literal["image", "video", "audio", ""] | None = Field(default=None, alias="attachmentType")
    attachment_mime: str | None = Field(default=None, alias="attachmentMime")
    receiver_id: str | None = Field(default=None, alias="receiverId")

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def validate_content(self):
        has_text = isinstance(self.text, str) and self.text.strip()
        if not has_text and not self.image and not self.attachment_url:
            raise ValueError("Message must contain text, an image, or an attachment.")
        return self


class EditMessageBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class UpdateAvatarBody(BaseModel):
    image: str


class IdentityKeySchema(BaseModel):
    public_key: str = Field(..., alias="publicKey", min_length=1)

    model_config = {"populate_by_name": True}


class SignedPreKeySchema(BaseModel):
    key_id: int = Field(..., alias="keyId", ge=0)
    public_key: str = Field(..., alias="publicKey", min_length=1)
    signature: str = Field(..., min_length=1)

    model_config = {"populate_by_name": True}


class OneTimePreKeySchema(BaseModel):
    key_id: int = Field(..., alias="keyId", ge=0)
    public_key: str = Field(..., alias="publicKey", min_length=1)

    model_config = {"populate_by_name": True}


class RegisterKeyBundleBody(BaseModel):
    identity_key: IdentityKeySchema = Field(..., alias="identityKey")
    signed_pre_key: SignedPreKeySchema = Field(..., alias="signedPreKey")
    one_time_pre_keys: list[OneTimePreKeySchema] = Field(..., alias="oneTimePreKeys", min_length=1)

    model_config = {"populate_by_name": True}


class ReplenishPreKeysBody(BaseModel):
    pre_keys: list[OneTimePreKeySchema] = Field(..., alias="preKeys", min_length=1)

    model_config = {"populate_by_name": True}


class AIChatCompletionsBody(BaseModel):
    model: str | None = None
    messages: list[dict]

    @field_validator("messages")
    @classmethod
    def validate_messages(cls, value: list[dict]) -> list[dict]:
        if not value:
            raise ValueError("Messages array is required.")
        return value
