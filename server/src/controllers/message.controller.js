import mongoose from "mongoose";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";

// ⚡ Safe Dynamic Imports
import * as socketModule from "../socket/index.js"; 
import * as aiService from "../services/ai.service.js"; 

export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user?._id;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ success: false, error: "Invalid conversation ID format." });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, error: "Conversation not found" });
        }

        // BOLA Check: Ensure user is a participant of the conversation
        const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) {
            return res.status(403).json({ success: false, error: "You are not authorized to view messages in this conversation" });
        }

        const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error("Error in getMessages:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const conversationId = req.params.conversationId || req.params.id || req.body.conversationId;
        const { text } = req.body;
        const senderId = req.user?._id;

        if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ success: false, error: "Conversation ID is missing or invalid." });
        }

        if (text === undefined || text === null || typeof text !== "string" || !text.trim()) {
            return res.status(400).json({ success: false, error: "Message text cannot be empty" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, error: "Conversation not found" });
        }

        // BOLA Check: Ensure sender is a participant of the conversation
        const isParticipant = conversation.participants.some(p => p.toString() === senderId.toString());
        if (!isParticipant) {
            return res.status(403).json({ success: false, error: "You are not authorized to send messages to this conversation" });
        }

        const newMessage = await Message.create({
            conversationId,
            senderId,
            text: text.trim()
        });

        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessageAt: new Date(),
            lastMessageId: newMessage._id
        });

        // ⚡ O(1) Bulk Fetch Optimization for Multi-Cast Loop ⚡
        const otherParticipantIds = conversation.participants.filter(
            (pId) => pId.toString() !== senderId.toString()
        );

        const receivers = await User.find({ _id: { $in: otherParticipantIds } }).lean();
        const io = socketModule.io || (socketModule.getIO && socketModule.getIO());

        for (const receiver of receivers) {
            // 🤖 AI Routing
            if (receiver.isAI) {
                if (typeof aiService.processAIResponse === 'function') {
                    aiService.processAIResponse(conversationId, text, senderId, receiver._id);
                } else if (typeof aiService.generateAIResponse === 'function') {
                    aiService.generateAIResponse(conversationId, text, senderId, receiver._id);
                } else if (typeof aiService.default === 'function') {
                    aiService.default(conversationId, text, senderId, receiver._id);
                }
            } 
            // 👤 Human Socket Routing
            else {
                if (io) {
                    const payload = {
                        ...newMessage.toObject(),
                        conversationId: newMessage.conversationId.toString(),
                        senderId: newMessage.senderId.toString(),
                    };
                    io.to(receiver._id.toString()).emit("newMessage", payload);
                }
            }
        }

        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        console.error("🔴 Error in sendMessage:", error.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};