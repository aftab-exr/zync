import mongoose, { Schema } from "mongoose";

const conversationSchema = new Schema(
  {
    type: { type: String, enum: ["dm", "group", "community"], default: "dm" },
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    dmParticipants: [{ type: Schema.Types.ObjectId, ref: "User" }],

    lastMessageAt: { type: Date, default: Date.now },
    lastMessageId: { type: Schema.Types.ObjectId, ref: "Message" },
    messageCount: { type: Number, default: 0 },

    // Group chat fields
    isGroup: { type: Boolean, default: false },
    groupName: { type: String, trim: true },
    groupAvatar: { type: String, default: "" },
    groupAdmins: [{ type: Schema.Types.ObjectId, ref: "User" }],
    groupId: { type: Schema.Types.ObjectId, ref: "Group", default: null },

    // Per-member wrapped AES-GCM group key (server never sees plaintext)
    encryptedGroupKeys: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        encryptedKeyPayload: { type: String },
      },
    ],

    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null },
    disappearAfter: { type: Number, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

conversationSchema.index({ dmParticipants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ deletedAt: 1 }, { sparse: true });

export default mongoose.model("Conversation", conversationSchema);