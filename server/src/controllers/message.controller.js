import mongoose from "mongoose";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";
import admin from "../config/firebase.js";
import cloudinary from "../config/cloudinary.js"; 
import * as socketModule from "../socket/index.js"; 
import { generateAIResponse } from "../services/ai.service.js"; 
import { importPublicKey, importPrivateKey, deriveSharedSecret, decryptText, encryptText } from "../lib/serverCrypto.js";
import apiResponse from "../utils/apiResponse.js";
import apiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { MESSAGE_EDIT_WINDOW_MS } from "../constants/constants.js";

// Send silent push notification using FCM
const sendSilentPush = async (token, senderName, ciphertext, conversationId) => {
    if (!token) return;
    try {
        const payload = {
            data: {
                senderName,
                ciphertext: ciphertext || "",
                conversationId: conversationId || ""
            },
            token
        };
        await admin.messaging().send(payload);
    } catch (pushError) {
        console.error("Failed to send silent push notification:", pushError);
    }
};

// Retrieve messages in a conversation, supports delta sync using after timestamp and cursor-based pagination
export const getMessages = asyncHandler(async (req, res, next) => {
    const { conversationId } = req.params;
    const userId = req.user?._id;
    const { cursor, limit, after } = req.query;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new apiError(401, "Unauthorized");
    }

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new apiError(400, "Invalid conversation ID format.");
    }

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
        throw new apiError(404, "Conversation not found");
    }

    const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
    if (!isParticipant) {
        throw new apiError(403, "You are not authorized to view messages in this conversation");
    }

    const filter = { conversationId };
    filter.deletedForMe = { $ne: userId };

    if (after) {
        const afterDate = new Date(after);
        if (!isNaN(afterDate.getTime())) {
            filter.createdAt = { $gt: afterDate };
        }
        
        // Delta sync: fetch newer messages chronologically
        const messages = await Message.find(filter).sort({ createdAt: 1 }).lean();
        return res.status(200).json(new apiResponse(200, "Messages retrieved successfully", {
            messages,
            nextCursor: null
        }));
    }

    // Pagination flow
    if (cursor) {
        if (!mongoose.Types.ObjectId.isValid(cursor)) {
            throw new apiError(400, "Invalid cursor format.");
        }
        filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));

    // Fetch messages sorted descending to get newest preceding messages
    const messages = await Message.find(filter)
        .sort({ _id: -1 })
        .limit(parsedLimit)
        .lean();

    // Reverse them to chronological order (oldest first)
    messages.reverse();

    const nextCursor = messages.length === parsedLimit ? messages[0]._id : null;

    res.status(200).json(new apiResponse(200, "Messages retrieved successfully", {
        messages,
        nextCursor
    }));
});

// Clear all message history for conversations the user is in
export const clearMessages = asyncHandler(async (req, res, next) => {
    const userId = req.user?._id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new apiError(401, "Unauthorized");
    }

    const conversations = await Conversation.find({ participants: userId })
        .select("_id")
        .lean();
    const conversationIds = conversations.map((c) => c._id);

    if (conversationIds.length === 0) {
        return res.status(200).json(new apiResponse(200, "No messages to clear.", { deletedCount: 0 }));
    }

    const result = await Message.deleteMany({ conversationId: { $in: conversationIds } });

    await Conversation.updateMany(
        { _id: { $in: conversationIds } },
        { $set: { lastMessageId: null } }
    );

    return res.status(200).json(
        new apiResponse(200, "Chat history cleared successfully.", {
            deletedCount: result.deletedCount || 0,
        })
    );
});

// Upload raw encrypted attachment to Cloudinary
export const uploadAttachment = asyncHandler(async (req, res, next) => {
    if (!req.file || !req.file.buffer) {
        throw new apiError(400, "No file provided.");
    }

    const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { resource_type: "raw", folder: "zync_secure_media" },
            (error, uploaded) => (error ? reject(error) : resolve(uploaded))
        );
        uploadStream.end(req.file.buffer);
    });

    return res.status(200).json(
        new apiResponse(200, "File uploaded successfully", { url: result.secure_url })
    );
});

// Send a message and optional AI integration response
export const sendMessage = asyncHandler(async (req, res, next) => {
    const conversationId = req.params.conversationId || req.params.id || req.body.conversationId;
    const { text, image, attachmentUrl, attachmentType, attachmentMime } = req.body;
    const senderId = req.user?._id;

    if (!senderId || !mongoose.Types.ObjectId.isValid(senderId)) {
        throw new apiError(401, "Unauthorized");
    }

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new apiError(400, "Conversation ID is missing or invalid.");
    }

    const hasText = typeof text === "string" && text.trim();
    if (!hasText && !image && !attachmentUrl) {
        throw new apiError(400, "Message must contain text, an image, or an attachment.");
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
        throw new apiError(404, "Conversation not found");
    }

    const isParticipant = conversation.participants.some(p => p.toString() === senderId.toString());
    if (!isParticipant) {
        throw new apiError(403, "You are not authorized to send messages");
    }

    let imageUrl = "";
    if (image) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
            folder: "zync_messages",
        });
        imageUrl = uploadResponse.secure_url;
    }

    const newMessage = await Message.create({
        conversationId,
        senderId,
        text: text ? text.trim() : "",
        imageUrl,
        attachmentUrl: attachmentUrl || "",
        attachmentType: attachmentType || "",
        attachmentMime: attachmentMime || ""
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
        if (receiver.isAI) {
            const aiPrivateKeyStr = process.env.AI_PRIVATE_KEY;
            const user = await User.findById(senderId).select("+publicKey").lean();
            
            if (!user || !user.publicKey) {
                throw new Error("Human public key missing from DB query");
            }
            if (typeof user.publicKey !== "string" || !user.publicKey.trim()) {
                throw new Error("Human public key is not a valid string");
            }
            
            const senderPublicKeyStr = user.publicKey;

            if (!aiPrivateKeyStr || !senderPublicKeyStr) {
                 console.error("AI Gateway keys missing. Cannot unwrap message.");
                 continue;
            }

            let plainTextPrompt = text; 
            let sharedSecret;

            try {
                const aiPrivateKey = await importPrivateKey(aiPrivateKeyStr);
                const senderPublicKey = await importPublicKey(senderPublicKeyStr);
                sharedSecret = await deriveSharedSecret(aiPrivateKey, senderPublicKey);

                if (text && text.startsWith('{"iv":')) {
                    const encryptedPayload = JSON.parse(text);
                    plainTextPrompt = await decryptText(encryptedPayload, sharedSecret);
                }
            } catch (err) {
                console.error("AI Gateway Unwrap Failed:", err);
                plainTextPrompt = "System Warning: Failed to decrypt human prompt.";
            }

            if (image) plainTextPrompt += "\n[User also attached an image payload]";

            const aiResponseText = await generateAIResponse(plainTextPrompt);

            let finalEncryptedResponse = aiResponseText;
            try {
                const encryptedObj = await encryptText(aiResponseText, sharedSecret);
                finalEncryptedResponse = JSON.stringify(encryptedObj);
            } catch (err) {
                console.error("AI Gateway Re-wrap Failed:", err);
            }

            const aiMessage = await Message.create({
                senderId: receiver._id,
                conversationId: conversation._id,
                text: finalEncryptedResponse,
                imageUrl: ""
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
                io.to(senderId.toString()).emit("newMessage", aiPayload);
            }

            if (req.user && req.user.fcmToken) {
                await sendSilentPush(
                    req.user.fcmToken,
                    receiver.displayName || receiver.username || "AI Assistant",
                    aiMessage.text,
                    conversation._id.toString()
                );
            }
        } else {
            if (io) {
                const payload = {
                    ...newMessage.toObject(),
                    conversationId: newMessage.conversationId.toString(),
                    senderId: newMessage.senderId.toString(),
                };
                io.to(receiver._id.toString()).emit("newMessage", payload);
            }

            if (receiver.fcmToken) {
                await sendSilentPush(
                    receiver.fcmToken,
                    req.user.displayName || req.user.username || "Someone",
                    newMessage.text,
                    conversation._id.toString()
                );
            }
        }
    }

    res.status(201).json(new apiResponse(201, "Message sent successfully", newMessage));
});

// Edit an existing message if within the 15-minute edit window
export const editMessage = asyncHandler(async (req, res, next) => {
    const { messageId } = req.params;
    const { text } = req.body;
    const userId = req.user?._id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new apiError(401, "Unauthorized");
    }

    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
        throw new apiError(400, "Invalid message ID format.");
    }

    const message = await Message.findById(messageId);
    if (!message) {
        throw new apiError(404, "Message not found");
    }

    if (message.senderId.toString() !== userId.toString()) {
        throw new apiError(403, "You can only edit your own messages");
    }

    const timeDiff = Date.now() - new Date(message.createdAt).getTime();
    if (timeDiff >= MESSAGE_EDIT_WINDOW_MS) {
        throw new apiError(403, "Message cannot be edited after the edit window has elapsed");
    }

    message.text = text ? text.trim() : "";
    message.isEdited = true;
    await message.save();

    const conversation = await Conversation.findById(message.conversationId);
    if (conversation) {
        const io = socketModule.io || (socketModule.getIO && socketModule.getIO());
        if (io) {
            conversation.participants.forEach((pId) => {
                io.to(pId.toString()).emit("message:edited", {
                    _id: message._id.toString(),
                    conversationId: message.conversationId.toString(),
                    text: message.text,
                    isEdited: true,
                    updatedAt: message.updatedAt
                });
            });
        }
    }

    return res.status(200).json(new apiResponse(200, "Message edited successfully", message));
});

// Delete a message globally for all participants
export const deleteMessageForEveryone = asyncHandler(async (req, res, next) => {
    const { messageId } = req.params;
    const userId = req.user?._id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new apiError(401, "Unauthorized");
    }

    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
        throw new apiError(400, "Invalid message ID format.");
    }

    const message = await Message.findById(messageId);
    if (!message) {
        throw new apiError(404, "Message not found");
    }

    if (message.senderId.toString() !== userId.toString()) {
        throw new apiError(403, "You can only delete your own messages");
    }

    message.text = "";
    message.imageUrl = "";
    message.attachmentUrl = "";
    message.attachmentType = "";
    message.attachmentMime = "";
    message.deletedForEveryone = true;
    await message.save();

    const conversation = await Conversation.findById(message.conversationId);
    if (conversation) {
        const io = socketModule.io || (socketModule.getIO && socketModule.getIO());
        if (io) {
            conversation.participants.forEach((pId) => {
                io.to(pId.toString()).emit("message:deletedForEveryone", {
                    _id: message._id.toString(),
                    conversationId: message.conversationId.toString(),
                    deletedForEveryone: true,
                    updatedAt: message.updatedAt
                });
            });
        }
    }

    return res.status(200).json(new apiResponse(200, "Message deleted for everyone", message));
});

// Hide a message from the caller's view (deletedForMe)
export const deleteMessageForMe = asyncHandler(async (req, res, next) => {
    const { messageId } = req.params;
    const userId = req.user?._id;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new apiError(401, "Unauthorized");
    }

    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
        throw new apiError(400, "Invalid message ID format.");
    }

    const message = await Message.findById(messageId);
    if (!message) {
        throw new apiError(404, "Message not found");
    }

    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
        throw new apiError(404, "Conversation not found");
    }

    const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
    if (!isParticipant) {
        throw new apiError(403, "You are not authorized to access this message");
    }

    if (!message.deletedForMe.includes(userId)) {
        message.deletedForMe.push(userId);
        await message.save();
    }

    const io = socketModule.io || (socketModule.getIO && socketModule.getIO());
    if (io) {
        io.to(userId.toString()).emit("message:deletedForMe", {
            _id: message._id.toString(),
            conversationId: message.conversationId.toString(),
        });
    }

    return res.status(200).json(new apiResponse(200, "Message deleted for you", message));
});