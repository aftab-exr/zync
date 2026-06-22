import mongoose, { Schema } from "mongoose";

const conversationSchema = new Schema(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageId: { type: Schema.Types.ObjectId, ref: "Message" },

    // Group chat fields
    isGroup: { type: Boolean, default: false },
    groupName: { type: String, trim: true },
    groupAvatar: { type: String, default: "" },
    groupAdmins: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // Per-member wrapped AES-GCM group key (server never sees plaintext)
    encryptedGroupKeys: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        encryptedKeyPayload: { type: String },
      },
    ],

    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Conversation", conversationSchema);