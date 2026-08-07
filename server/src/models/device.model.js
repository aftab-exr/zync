import mongoose, { Schema } from "mongoose";

/**
 * Device session tracking. One document per active device per user.
 * Enables multi-device support, session revocation, and token rotation detection.
 * Per SCHEMA.md §7.6
 */
const deviceSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    deviceName: { type: String, default: "Unknown Device" },
    deviceType: { type: String, default: "web" }, // "web" | "ios" | "android" (V3)

    refreshTokenHash: { type: String, required: true }, // [SENSITIVE] bcrypt hash
    tokenFamily: { type: String, required: true, unique: true }, // UUID for rotation detection

    lastUsedAt: { type: Date, default: Date.now },
    ipAddress: { type: String }, // [SENSITIVE] 30-day TTL
    userAgent: { type: String },

    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
deviceSchema.index({ userId: 1, isRevoked: 1 }); // Active sessions per user
deviceSchema.index({ tokenFamily: 1 }, { unique: true }); // Rotation detection
deviceSchema.index({ ipAddress: 1 }, { sparse: true, expireAfterSeconds: 2592000 }); // 30-day TTL

export default mongoose.model("Device", deviceSchema);