import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, default: "" },
    imageUrl: { type: String, default: "" },

    // Encrypted media — stored as Cloudinary raw asset (server never sees plaintext)
    attachmentUrl: { type: String, default: "" },
    attachmentType: { type: String, enum: ["image", "video", "audio", ""], default: "" },
    attachmentMime: { type: String, default: "" },

    // Message categorization
    messageType: {
      type: String,
      enum: ["text", "image", "audio", "video", "call_log"],
      default: "text",
    },
    ciphertextType: { type: Number, default: 1 },

    // Delivery state
    isRead: { type: Boolean, default: false },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },

    // Edit & Deletion
    isEdited: { type: Boolean, default: false },
    deletedForEveryone: { type: Boolean, default: false },
    deletedForMe: [{ type: Schema.Types.ObjectId, ref: "User" }],
    deletedFor: { type: String, enum: ["sender", "everyone", ""], default: "" },
    deletedAt: { type: Date, default: null },

    // Threading & Moderation
    replyToId: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    flaggedAt: { type: Date, default: null },

    // Disappearing messages
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Every message must have at least some content (unless it was deleted for everyone)
messageSchema.pre("save", function () {
  if (!this.deletedForEveryone && !this.text && !this.imageUrl && !this.attachmentUrl) {
    throw new Error("A message must contain text, an image, or an attachment.");
  }
});

messageSchema.index({ createdAt: 1 });
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
messageSchema.index({ deletedAt: 1 }, { sparse: true });

export default mongoose.model("Message", messageSchema);