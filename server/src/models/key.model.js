import mongoose, { Schema } from "mongoose";

const keySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    identityKey: {
      publicKey: { type: String, required: true },
    },

    signedPreKey: {
      keyId: { type: Number, required: true },
      publicKey: { type: String, required: true },
      signature: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },

    oneTimePreKeys: [
      {
        _id: false,
        keyId: { type: Number, required: true },
        publicKey: { type: String, required: true },
      },
    ],

    oneTimePreKeyCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Key", keySchema);
