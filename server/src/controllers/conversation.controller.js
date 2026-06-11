import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";

// Fetch all conversations for the logged-in user
export const getConversations = async (req, res) => {
    try {
        const userId = req.user._id;
        const conversations = await Conversation.find({
            participants: { $in: [userId] }
        })
        .populate("participants", "username displayName avatarUrl isAI status")
        .populate("lastMessageId")
        .sort({ lastMessageAt: -1 });

        res.status(200).json({ success: true, data: conversations });
    } catch (error) {
        console.error("Error in getConversations:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// V1: Create or fetch 1-on-1 conversation
export const createConversation = async (req, res) => {
    try {
        const { receiverId } = req.body;
        const senderId = req.user._id;

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
            .populate("participants", "username displayName avatarUrl isAI status");

        res.status(201).json({ success: true, data: populatedConv });
    } catch (error) {
        console.error("Error in createConversation:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ⚡ PHASE 2.3: Create Group Conversation
export const createGroupConversation = async (req, res) => {
    try {
        const { name, participantIds } = req.body;
        const creatorId = req.user._id;

        if (!name || !participantIds || participantIds.length < 1) {
            return res.status(400).json({ success: false, error: "Group name and at least 1 other member required." });
        }

        // Combine the creator and the selected friends, ensuring no duplicates
        const allParticipants = [...new Set([...participantIds, creatorId.toString()])];

        const newGroup = await Conversation.create({
            isGroup: true,
            groupName: name,
            participants: allParticipants,
            groupAdmins: [creatorId]
        });

        const populatedGroup = await Conversation.findById(newGroup._id)
            .populate("participants", "username displayName avatarUrl isAI status");

        res.status(201).json({ success: true, data: populatedGroup });
    } catch (error) {
        console.error("🛠️ Group Creation Error:", error.message);
        res.status(500).json({ success: false, error: "Failed to create group" });
    }
};