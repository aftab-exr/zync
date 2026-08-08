-- Zync backend schema for Supabase (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_ai BOOLEAN NOT NULL DEFAULT FALSE,
    provider TEXT NOT NULL DEFAULT 'google' CHECK (provider IN ('google', 'email')),
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL CHECK (char_length(display_name) <= 50),
    avatar_url TEXT NOT NULL DEFAULT '',
    avatar_public_id TEXT NOT NULL DEFAULT '',
    public_key TEXT NOT NULL DEFAULT '',
    identity_key_public TEXT NOT NULL DEFAULT '',
    settings JSONB NOT NULL DEFAULT '{"notifications": true, "soundEnabled": true, "theme": "dark"}'::jsonb,
    status JSONB NOT NULL DEFAULT '{"online": false, "lastSeen": null}'::jsonb,
    last_display_name_change_at TIMESTAMPTZ,
    last_username_change_at TIMESTAMPTZ,
    last_ip TEXT,
    deleted_at TIMESTAMPTZ,
    fcm_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]+$' AND char_length(username) BETWEEN 3 AND 30)
);

CREATE INDEX idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status_last_seen ON users ((status->>'lastSeen'));

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL DEFAULT 'Unknown Device',
    device_type TEXT NOT NULL DEFAULT 'web' CHECK (device_type IN ('web', 'ios', 'android')),
    refresh_token_hash TEXT NOT NULL,
    token_family TEXT NOT NULL UNIQUE,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_user_id ON devices (user_id);
CREATE INDEX idx_devices_user_revoked ON devices (user_id, is_revoked);
CREATE INDEX idx_devices_expires_at ON devices (expires_at);

CREATE TABLE key_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    identity_key JSONB NOT NULL,
    signed_pre_key JSONB NOT NULL,
    one_time_pre_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    one_time_pre_key_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_key_bundles_user_id ON key_bundles (user_id);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL DEFAULT 'dm' CHECK (type IN ('dm', 'group', 'community')),
    participants UUID[] NOT NULL DEFAULT '{}',
    dm_participants UUID[] NOT NULL DEFAULT '{}',
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_id UUID,
    message_count INTEGER NOT NULL DEFAULT 0,
    is_group BOOLEAN NOT NULL DEFAULT FALSE,
    group_name TEXT,
    group_avatar TEXT NOT NULL DEFAULT '',
    group_admins UUID[] NOT NULL DEFAULT '{}',
    group_id UUID,
    encrypted_group_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    community_id UUID,
    disappear_after INTEGER,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_participants ON conversations USING GIN (participants);
CREATE INDEX idx_conversations_last_message_at ON conversations (last_message_at DESC);
CREATE INDEX idx_conversations_deleted_at ON conversations (deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    attachment_url TEXT NOT NULL DEFAULT '',
    attachment_type TEXT NOT NULL DEFAULT '' CHECK (attachment_type IN ('image', 'video', 'audio', '')),
    attachment_mime TEXT NOT NULL DEFAULT '',
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'video', 'call_log')),
    ciphertext_type INTEGER NOT NULL DEFAULT 1,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_for_me UUID[] NOT NULL DEFAULT '{}',
    deleted_for TEXT NOT NULL DEFAULT '' CHECK (deleted_for IN ('sender', 'everyone', '')),
    deleted_at TIMESTAMPTZ,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    flagged_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_last_message
    FOREIGN KEY (last_message_id) REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at);
CREATE INDEX idx_messages_created_at ON messages (created_at);
CREATE INDEX idx_messages_expires_at ON messages (expires_at) WHERE expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION consume_one_time_prekey(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_keys JSONB;
    v_consumed JSONB;
    v_remaining INTEGER;
BEGIN
    SELECT one_time_pre_keys, one_time_pre_key_count
    INTO v_keys, v_remaining
    FROM key_bundles
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_keys IS NULL OR jsonb_array_length(v_keys) = 0 THEN
        RETURN jsonb_build_object(
            'consumed', NULL,
            'remaining', COALESCE(v_remaining, 0)
        );
    END IF;

    v_consumed := v_keys->0;
    v_keys := v_keys - 0;
    v_remaining := GREATEST(0, COALESCE(v_remaining, 0) - 1);

    UPDATE key_bundles
    SET one_time_pre_keys = v_keys,
        one_time_pre_key_count = v_remaining,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'consumed', v_consumed,
        'remaining', v_remaining
    );
END;
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER key_bundles_updated_at BEFORE UPDATE ON key_bundles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
