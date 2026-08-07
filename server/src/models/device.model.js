import mongoose, { Schema } from "mongoose";

const deviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceName: { type: String, default: "Unknown Device" },
    deviceType: { type: String, enum: ["web", "ios", "android"], default: "web" },
    refreshTokenHash: { type: String, required: true },
    tokenFamily: { type: String, required: true, unique: true, index: true },
    lastUsedAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

deviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
deviceSchema.index({ userId: 1, isRevoked: 1 });

export default mongoose.model("Device", deviceSchema);
