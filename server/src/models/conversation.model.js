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

    // ⚡ VECTOR 2: Multi-Cast Zero-Knowledge Encryption
    // The master AES-GCM group key, wrapped individually for each participant
    // using that member's ECDH shared secret. Server never sees the raw key.
    encryptedGroupKeys: [{
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        encryptedKeyPayload: { type: String }
    }],

    communityId: { type: Schema.Types.ObjectId, ref: "Community", default: null } // Reserved for V3
}, {
    timestamps: true
});

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;