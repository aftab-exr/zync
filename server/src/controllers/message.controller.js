import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";
import { getIO } from "../socket/index.js";
import { processAIResponse } from "../services/ai.service.js";

export const sendMessage = async (req, res) => {
    try {
        const { text, receiverId } = req.body;
        const { conversationId } = req.params;
        const senderId = req.user._id;

        // 1. Save message to database
        const newMessage = await Message.create({
            conversationId,
            senderId,
            text
        });

        // 2. Update the conversation's "lastMessageAt" so it jumps to the top of the sidebar
        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessageAt: new Date(),
            lastMessageId: newMessage._id
        });

        // 3. ⚡ PHASE 7: The Intelligence Interceptor ⚡
        const receiver = await User.findById(receiverId).lean(); // High-speed JSON conversion

        if (receiver && receiver.isAI) {
            // FIRE & FORGET: Do NOT 'await' this. Let it run in the background 
            // so the human's HTTP POST resolves in < 50ms.
            processAIResponse(conversationId, text, senderId, receiverId);
        } else {
            // Standard Human-to-Human real-time socket delivery
            const io = getIO();
            io.to(receiverId.toString()).emit("newMessage", newMessage);
        }

        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        console.error("✉️ Send Message Error:", error.message);
        res.status(500).json({ success: false, error: "Failed to send message" });
    }
};

export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;

        // Fetch all messages for this thread, oldest to newest
        const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });

        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error("📋 Fetch Messages Error:", error.message);
        res.status(500).json({ success: false, error: "Failed to fetch messages" });
    }
};