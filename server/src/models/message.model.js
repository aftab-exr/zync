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

    isRead: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false },
    deletedForEveryone: { type: Boolean, default: false },
    deletedForMe: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// Every message must have at least some content (unless it was deleted for everyone)
messageSchema.pre("save", function () {
  if (!this.deletedForEveryone && !this.text && !this.imageUrl && !this.attachmentUrl) {
    throw new Error("A message must contain text, an image, or an attachment.");
  }
});

export default mongoose.model("Message", messageSchema);