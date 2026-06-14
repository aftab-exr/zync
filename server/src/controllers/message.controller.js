import mongoose from "mongoose";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";

// ⚡ PHASE 2.1: Cloudinary Import
import cloudinary from "../config/cloudinary.js"; 

// ⚡ Safe Dynamic Imports
import * as socketModule from "../socket/index.js"; 
import { generateAIResponse } from "../services/ai.service.js"; 
import { importPublicKey, importPrivateKey, deriveSharedSecret, decryptText, encryptText } from "../lib/serverCrypto.js";

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

        const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) {
            return res.status(403).json({ success: false, error: "You are not authorized to view messages in this conversation" });
        }

        const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error("Error in getMessages:", error.stack || error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const conversationId = req.params.conversationId || req.params.id || req.body.conversationId;
        const { text, image } = req.body; 
        const senderId = req.user?._id;

        if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ success: false, error: "Conversation ID is missing or invalid." });
        }

        if ((text === undefined || text === null || typeof text !== "string" || !text.trim()) && !image) {
            return res.status(400).json({ success: false, error: "Message must contain text or an image." });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, error: "Conversation not found" });
        }

        const isParticipant = conversation.participants.some(p => p.toString() === senderId.toString());
        if (!isParticipant) {
            return res.status(403).json({ success: false, error: "You are not authorized to send messages" });
        }

        // ⚡ PHASE 2.1: THE CLOUDINARY UPLOAD
        let imageUrl = "";
        if (image) {
            const uploadResponse = await cloudinary.uploader.upload(image, {
                folder: "zync_messages",
            });
            imageUrl = uploadResponse.secure_url;
        }

        // ⚡ Save the Human's Encrypted Message
        const newMessage = await Message.create({
            conversationId,
            senderId,
            text: text ? text.trim() : "",
            imageUrl
        });

        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessageAt: new Date(),
            lastMessageId: newMessage._id
        });

        const otherParticipantIds = conversation.participants.filter(
            (pId) => pId.toString() !== senderId.toString()
        );

        const receivers = await User.find({ _id: { $in: otherParticipantIds } }).lean();
        const io = socketModule.io || (socketModule.getIO && socketModule.getIO());

        for (const receiver of receivers) {
            // 🤖 AI Cryptographic Routing
            if (receiver.isAI) {
                const aiPrivateKeyStr = process.env.AI_PRIVATE_KEY;
                const senderPublicKeyStr = req.user.publicKey;

                if (!aiPrivateKeyStr || !senderPublicKeyStr) {
                     console.error("🔴 AI Gateway keys missing. Cannot unwrap message.");
                     continue;
                }

                let plainTextPrompt = text; 
                let sharedSecret;

                // 1. UNWRAP THE CIPHER-TEXT
                try {
                    const aiPrivateKey = await importPrivateKey(aiPrivateKeyStr);
                    const senderPublicKey = await importPublicKey(senderPublicKeyStr);
                    sharedSecret = await deriveSharedSecret(aiPrivateKey, senderPublicKey);

                    if (text && text.startsWith('{"iv":')) {
                        const encryptedPayload = JSON.parse(text);
                        plainTextPrompt = await decryptText(encryptedPayload, sharedSecret);
                    }
                } catch (err) {
                    console.error("🔴 AI Gateway Unwrap Failed:", err);
                    plainTextPrompt = "System Warning: Failed to decrypt human prompt.";
                }

                if (image) plainTextPrompt += "\n[User also attached an image payload]";

                // 2. INFERENCE (GROQ Llama 3.3)
                const aiResponseText = await generateAIResponse(plainTextPrompt);

                // 3. RE-WRAP THE CIPHER-TEXT
                let finalEncryptedResponse = aiResponseText;
                try {
                    const encryptedObj = await encryptText(aiResponseText, sharedSecret);
                    finalEncryptedResponse = JSON.stringify(encryptedObj);
                } catch (err) {
                    console.error("🔴 AI Gateway Re-wrap Failed:", err);
                }

                // 4. SAVE AND DELIVER AI RESPONSE
                const aiMessage = await Message.create({
                    senderId: receiver._id,
                    conversationId: conversation._id,
                    text: finalEncryptedResponse,
                    imageUrl: "" // Assuming AI doesn't reply with images yet
                });

                await Conversation.findByIdAndUpdate(conversationId, {
                    lastMessageAt: new Date(),
                    lastMessageId: aiMessage._id
                });

                if (io) {
                    const aiPayload = {
                        ...aiMessage.toObject(),
                        conversationId: aiMessage.conversationId.toString(),
                        senderId: aiMessage.senderId.toString(),
                    };
                    // Emit directly back to the human sender
                    io.to(senderId.toString()).emit("newMessage", aiPayload);
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
        console.error("🔴 Error in sendMessage:", error.stack || error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};