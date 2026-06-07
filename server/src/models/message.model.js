import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema({
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
    text: { 
        type: String, 
        required: true 
    },
    isRead: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true });

export default mongoose.model("Message", messageSchema);