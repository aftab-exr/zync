import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import { getIO } from "../socket/index.js";
import cloudinary from "../config/cloudinary.js"; // ⚡ PHASE 2.1: Imported CDN

export const getMessages = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error("🔴 Error in getMessages:\n", error.stack);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const { text, image, receiverId } = req.body;
        const senderId = req.user._id;
        const { id: conversationId } = req.params;

        // ⚡ Validate that the message isn't completely empty
        if (!text && !image) {
            return res.status(400).json({ success: false, error: "Message must contain text or an image." });
        }

        let imageUrl = "";

        // ⚡ THE CLOUDINARY HANDOFF
        if (image) {
            const uploadResponse = await cloudinary.uploader.upload(image, {
                folder: "zync_messages",
            });
            imageUrl = uploadResponse.secure_url;
        }

        const newMessage = await Message.create({
            conversationId,
            senderId,
            text: text || "",
            imageUrl, // ⚡ Saved to Mongo
        });

        const conversation = await Conversation.findByIdAndUpdate(
            conversationId,
            { lastMessageAt: new Date(), lastMessageId: newMessage._id },
            { new: true }
        );

        // ⚡ FAST SOCKET MESH: We only broadcast the lightweight URL string!
        const io = getIO();
        for (const participantId of conversation.participants) {
            io.to(participantId.toString()).emit("newMessage", newMessage);
        }

        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        console.error("🔴 Error in sendMessage:\n", error.stack);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};