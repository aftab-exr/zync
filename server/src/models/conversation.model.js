import mongoose, { Schema } from "mongoose";

const conversationSchema = new Schema({
    // V1: 1-on-1 / V2: Multiplayer Array
    participants: [{
        type: Schema.Types.ObjectId,
        ref: "User"
    }],
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageId: { type: Schema.Types.ObjectId, ref: "Message" },

    // ⚡ PHASE 2.3: Group Chat Infrastructure
    isGroup: { type: Boolean, default: false },
    groupName: { type: String, trim: true },
    groupAvatar: { type: String, default: "" },
    groupAdmins: [{ type: Schema.Types.ObjectId, ref: "User" }],
    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null } // Reserved for V3
}, {
    timestamps: true
});

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;