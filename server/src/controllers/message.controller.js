import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";
import { getIO } from "../socket/index.js";
import { processAIResponse } from "../services/ai.service.js"; // Ensure AI is imported

export const getMessages = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error("Error in getMessages:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { text } = req.body;
        const senderId = req.user._id;

        const newMessage = await Message.create({
            conversationId,
            senderId,
            text
        });

        const conversation = await Conversation.findById(conversationId);
        
        if (!conversation) {
            return res.status(404).json({ success: false, error: "Conversation not found" });
        }

        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessageAt: new Date(),
            lastMessageId: newMessage._id
        });

        // ⚡ PHASE 2.3: The Multi-Cast Engine ⚡
        const io = getIO();

        for (const participantId of conversation.participants) {
            // Skip the sender (they already see it locally)
            if (participantId.toString() === senderId.toString()) continue;

            const receiver = await User.findById(participantId).lean();

            // AI Interceptor
            if (receiver && receiver.isAI) {
                processAIResponse(conversationId, text, senderId, participantId);
            } else {
                // Human Socket Routing
                io.to(participantId.toString()).emit("newMessage", newMessage);
            }
        }

        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        console.error("Error in sendMessage:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};