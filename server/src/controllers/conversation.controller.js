// server/controllers/conversation.controller.js
import Conversation from "../models/conversation.model.js";

export const createOrGetDM = async (req, res) => {
    try {
        const { targetUserId } = req.body;
        const currentUserId = req.user._id;

        if (targetUserId === currentUserId.toString()) {
            return res.status(400).json({ success: false, error: "Cannot create a DM with yourself." });
        }

        // The DM Deduplication Query: Find an existing DM with exactly these two participants
        let conversation = await Conversation.findOne({
            type: 'dm',
            dmParticipants: { $all: [currentUserId, targetUserId], $size: 2 }
        });

        if (conversation) {
            return res.status(200).json({ success: true, data: conversation, isNew: false });
        }

        // Create new DM if none exists
        conversation = await Conversation.create({
            type: 'dm',
            dmParticipants: [currentUserId, targetUserId]
        });

        res.status(201).json({ success: true, data: conversation, isNew: true });
    } catch (error) {
        console.error("💬 DM Init Error:", error.message);
        res.status(500).json({ success: false, error: "Failed to initialize conversation." });
    }
};