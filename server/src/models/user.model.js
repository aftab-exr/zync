import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    // Auth identity
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    isAI: { type: Boolean, default: false },
    provider: { type: String, enum: ["google", "email"], default: "google" },

    // Public profile
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^[a-z0-9_]+$/, "Username can only contain letters, numbers, and underscores"],
      minlength: 3,
      maxlength: 30,
    },
    displayName: { type: String, required: true, maxlength: 50 },
    avatarUrl: { type: String, default: "" },
    avatarPublicId: { type: String, default: "" },

    // E2E encryption keys
    publicKey: { type: String, default: "" },
    identityKeyPublic: { type: String, default: "" },

    // Preferences
    settings: {
      notifications: { type: Boolean, default: true },
      soundEnabled: { type: Boolean, default: true },
      theme: { type: String, enum: ["dark", "light", "system"], default: "dark" },
    },
    status: {
      online: { type: Boolean, default: false },
      lastSeen: { type: Date, default: Date.now },
    },

    // Profile change rate-limiting timestamps
    lastDisplayNameChangeAt: { type: Date, default: null },
    lastUsernameChangeAt: { type: Date, default: null },

    // Security
    lastIp: { type: String },
    deletedAt: { type: Date, default: null },
    fcmToken: { type: String, default: null },
  },
  { timestamps: true }
);

userSchema.index({ "status.lastSeen": 1 });
userSchema.index({ deletedAt: 1 });

export default mongoose.model("User", userSchema);