import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
    {
        conversationId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Conversation', 
            required: true,
            index: true 
        },
        senderId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User', 
            required: true 
        },
        // ⚡ FIX: Default to empty string instead of requiring text
        text: { 
            type: String, 
            default: "" 
        },
        // ⚡ PHASE 2.1: The Media Expansion
        imageUrl: {
            type: String,
            default: ""
        },
        isRead: { 
            type: Boolean, 
            default: false 
        }
    }, 
    { timestamps: true }
);

// ⚡ Modern Mongoose Validation (No 'next' callback needed)
messageSchema.pre("save", function () {
    if (!this.text && !this.imageUrl) {
        throw new Error("A message must contain either text or an image.");
    }
});

export default mongoose.model("Message", messageSchema);