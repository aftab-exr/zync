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
        // ⚡ PHASE 2.1: The Media Expansion (legacy plaintext image path)
        imageUrl: {
            type: String,
            default: ""
        },
        // ⚡ PHASE 2: Zero-Knowledge Encrypted Media.
        // `attachmentUrl` points at a Cloudinary *raw* asset that is an encrypted
        // AES-GCM blob (IV + ciphertext) — the server never sees the plaintext.
        // `attachmentType` drives which element the client renders; `attachmentMime`
        // lets the recipient rebuild the decrypted Blob with the right content-type.
        attachmentUrl: {
            type: String,
            default: ""
        },
        attachmentType: {
            type: String,
            enum: ["image", "video", "audio", ""],
            default: ""
        },
        attachmentMime: {
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
    if (!this.text && !this.imageUrl && !this.attachmentUrl) {
        throw new Error("A message must contain text, an image, or an attachment.");
    }
});

export default mongoose.model("Message", messageSchema);