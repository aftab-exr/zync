import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
            index: true, // Speeds up fetching messages for a specific chat
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        text: {
            type: String,
            default: "",
        },
        // ⚡ PHASE 2.1: The Media Expansion
        imageUrl: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

// A message must have EITHER text or an image (or both), but it cannot be completely empty.
messageSchema.pre("save", function (next) {
    if (!this.text && !this.imageUrl) {
        return next(new Error("A message must contain either text or an image."));
    }
    next();
});

const Message = mongoose.model("Message", messageSchema);
export default Message;