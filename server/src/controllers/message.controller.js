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
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

export const getMessages = asyncHandler(async (req, res, next) => {
    const { conversationId } = req.params;
    const userId = req.user?._id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new apiError(401, "Unauthorized");
    }

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new apiError(400, "Invalid conversation ID format.");
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new apiError(404, "Conversation not found");
    }

    const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
    if (!isParticipant) {
        throw new apiError(403, "You are not authorized to view messages in this conversation");
    }

    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
    res.status(200).json(new apiResponse(200, "Messages retrieved successfully", messages));
});

export const sendMessage = asyncHandler(async (req, res, next) => {
    const conversationId = req.params.conversationId || req.params.id || req.body.conversationId;
    const { text, image } = req.body; 
    const senderId = req.user?._id;

    if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) {
        throw new apiError(401, "Unauthorized");
    }

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new apiError(400, "Conversation ID is missing or invalid.");
    }

    if ((text === undefined || text === null || typeof text !== "string" || !text.trim()) && !image) {
        throw new apiError(400, "Message must contain text or an image.");
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new apiError(404, "Conversation not found");
    }

    const isParticipant = conversation.participants.some(p => p.toString() === senderId.toString());
    if (!isParticipant) {
        throw new apiError(403, "You are not authorized to send messages");
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

    conversation.lastMessageAt = new Date();
    conversation.lastMessageId = newMessage._id;
    await conversation.save();

    const otherParticipantIds = conversation.participants.filter(
        (pId) => pId.toString() !== senderId.toString()
    );

    const receivers = await User.find({ _id: { $in: otherParticipantIds } }).lean();
    const io = socketModule.io || (socketModule.getIO && socketModule.getIO());

    for (const receiver of receivers) {
        // 🤖 AI Cryptographic Routing
        if (receiver.isAI) {
            const aiPrivateKeyStr = process.env.AI_PRIVATE_KEY;
            
            // Explicitly fetch the sender user/document and ensure publicKey is retrieved
            const user = await User.findById(senderId).select("+publicKey");
            
            // Safety check right before decryption/unwrap
            if (!user.publicKey) {
                throw new Error("CRITICAL: Human public key missing from DB query");
            }
            if (typeof user.publicKey !== "string" || !user.publicKey.trim()) {
                throw new Error("CRITICAL: Human public key is not a valid string");
            }
            
            const senderPublicKeyStr = user.publicKey;

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

            conversation.lastMessageAt = new Date();
            conversation.lastMessageId = aiMessage._id;
            await conversation.save();

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

    res.status(201).json(new apiResponse(201, "Message sent successfully", newMessage));
});