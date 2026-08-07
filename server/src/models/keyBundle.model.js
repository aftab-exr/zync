import mongoose, { Schema } from "mongoose";

/**
 * Signal Protocol key bundles. One document per user.
 * Stores public key material only — private keys NEVER touch the server.
 * Per SCHEMA.md §7.2
 */
const keyBundleSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    // Identity Key (Ed25519 public key, base64)
    identityKey: {
      publicKey: { type: String, required: true },
    },

    // Signed Pre-Key (X25519 public key, signed by Identity Key)
    signedPreKey: {
      keyId: { type: Number, required: true },
      publicKey: { type: String, required: true },
      signature: { type: String, required: true }, // [SENSITIVE] Ed25519 signature
      createdAt: { type: Date, default: Date.now },
    },

    // One-Time Pre-Keys (X25519 public keys, consumed on key exchange)
    oneTimePreKeys: [
      {
        keyId: { type: Number, required: true },
        publicKey: { type: String, required: true },
      },
    ],

    // Denormalized count for replenishment alerts
    oneTimePreKeyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// TTL: auto-expire unused key bundles after 90 days
keyBundleSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model("KeyBundle", keyBundleSchema);