import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js"; // Force registration of Message model for populating lastMessageId

// Fetch all conversations for the logged-in user
export const getConversations = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, error: "Invalid user session or ID" });
        }

        const conversations = await Conversation.find({
            participants: { $in: [userId] }
        })
        .populate("participants", "username displayName avatarUrl isAI status publicKey")
        .populate("lastMessageId")
        .sort({ lastMessageAt: -1 });

        res.status(200).json({ success: true, data: conversations });
    } catch (error) {
        console.error("Error in getConversations:", error.stack || error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// V1: Create or fetch 1-on-1 conversation
export const createConversation = async (req, res) => {
    try {
        const { receiverId } = req.body;
        const senderId = req.user?._id;

        if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) {
            return res.status(400).json({ success: false, error: "Invalid sender session" });
        }

        if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
            return res.status(400).json({ success: false, error: "Invalid receiver ID format" });
        }

        if (senderId.toString() === receiverId.toString()) {
            return res.status(400).json({ success: false, error: "Cannot create conversation with yourself" });
        }

        // Verify receiver user exists and is not deleted
        const receiver = await User.findOne({ _id: receiverId, deletedAt: null });
        if (!receiver) {
            return res.status(404).json({ success: false, error: "Receiver user not found or has been deleted" });
        }

        // Check if 1-on-1 conversation already exists
        let conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [senderId, receiverId] }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, receiverId],
                isGroup: false
            });
        }

        const populatedConv = await Conversation.findById(conversation._id)
            .populate("participants", "username displayName avatarUrl isAI status publicKey");

        res.status(201).json({ success: true, data: populatedConv });
    } catch (error) {
        console.error("Error in createConversation:", error.stack || error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ⚡ PHASE 2.3: Create Group Conversation
export const createGroupConversation = async (req, res) => {
    try {
        const { name, participantIds, encryptedGroupKeys } = req.body;
        const creatorId = req.user?._id;

        if (!creatorId || !mongoose.Types.ObjectId.isValid(creatorId)) {
            return res.status(400).json({ success: false, error: "Invalid creator session" });
        }

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ success: false, error: "Group name is required." });
        }

        const trimmedName = name.trim();
        if (trimmedName.length > 50) {
            return res.status(400).json({ success: false, error: "Group name must be 50 characters or less." });
        }

        if (!participantIds || !Array.isArray(participantIds) || participantIds.length < 1) {
            return res.status(400).json({ success: false, error: "Group name and at least 1 other member required." });
        }

        // Validate each participant ID format
        for (const pId of participantIds) {
            if (!pId || !mongoose.Types.ObjectId.isValid(pId)) {
                return res.status(400).json({ success: false, error: `Invalid participant ID format: ${pId}` });
            }
        }

        // Combine the creator and the selected friends, ensuring no duplicates
        const allParticipants = [...new Set([...participantIds.map(id => id.toString()), creatorId.toString()])];

        // Verify all participants exist and are not soft-deleted
        const existingUsersCount = await User.countDocuments({
            _id: { $in: allParticipants },
            deletedAt: null
        });

        if (existingUsersCount !== allParticipants.length) {
            return res.status(400).json({ success: false, error: "One or more participants are invalid or have deleted accounts" });
        }

        // ⚡ VECTOR 2: Accept the per-member wrapped group keys (optional for
        // backwards compatibility — legacy groups created without them stay plaintext).
        const sanitizedGroupKeys = Array.isArray(encryptedGroupKeys)
            ? encryptedGroupKeys.filter(
                (k) => k && mongoose.Types.ObjectId.isValid(k.userId) && typeof k.encryptedKeyPayload === "string"
            )
            : [];

        const newGroup = await Conversation.create({
            isGroup: true,
            groupName: trimmedName,
            participants: allParticipants,
            groupAdmins: [creatorId],
            encryptedGroupKeys: sanitizedGroupKeys
        });

        const populatedGroup = await Conversation.findById(newGroup._id)
            .populate("participants", "username displayName avatarUrl isAI status publicKey");

        res.status(201).json({ success: true, data: populatedGroup });
    } catch (error) {
        console.error("🛠️ Group Creation Error:", error.stack || error);
        res.status(500).json({ success: false, error: "Failed to create group" });
    }
};