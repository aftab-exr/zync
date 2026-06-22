import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import admin from "firebase-admin";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import CallLog from "../models/callLog.model.js";
import Conversation from "../models/conversation.model.js";

let io;
let pubClient;
let subClient;
const activeCalls = new Map();

// Helper to log a WebRTC call to the database and emit a status message to the chat
const logCallAndEmit = async (session, duration) => {
    try {
        const callerId = session.callerId;
        const receiverId = session.receiverId;
        const callType = session.callType;
        const status = session.status;

        // 1. Create CallLog entry
        await CallLog.create({
            caller: callerId,
            receiver: receiverId,
            callType,
            duration,
            status,
            timestamp: new Date()
        });

        // 2. Find or create 1-to-1 conversation for call status message routing
        let conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [callerId, receiverId] }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                isGroup: false,
                participants: [callerId, receiverId]
            });
        }

        // 3. Format message text representation of call status
        let text = "";
        if (status === "missed") {
            text = `Missed ${callType} call`;
        } else {
            const mins = Math.max(1, Math.round(duration / 60));
            text = `📞 ${callType.charAt(0).toUpperCase() + callType.slice(1)} call - ${mins} mins`;
        }

        // 4. Create Message
        const newMessage = await Message.create({
            conversationId: conversation._id,
            senderId: callerId,
            text
        });

        conversation.lastMessageAt = new Date();
        conversation.lastMessageId = newMessage._id;
        await conversation.save();

        // 5. Emit newMessage to both users to update chat UI
        if (io) {
            const payload = {
                ...newMessage.toObject(),
                conversationId: newMessage.conversationId.toString(),
                senderId: newMessage.senderId.toString()
            };
            io.to(callerId).emit("newMessage", payload);
            io.to(receiverId).emit("newMessage", payload);
        }
    } catch (err) {
        console.error("Error logging call and emitting message:", err);
    }
};

export const initializeSocket = (httpServer) => {
    const sanitizeOrigin = (url) => url ? url.replace(/['"]/g, "").trim() : "";
    const CLIENT_ORIGIN = sanitizeOrigin(process.env.CLIENT_ORIGIN) || "http://localhost:5173";
    const PRODUCTION_ORIGIN = sanitizeOrigin(process.env.PRODUCTION_ORIGIN) || "https://zync-znty.onrender.com";
    const socketOrigins = [CLIENT_ORIGIN, PRODUCTION_ORIGIN].filter(Boolean);

    if (CLIENT_ORIGIN.includes("localhost")) {
        const localIpOrigin = CLIENT_ORIGIN.replace("localhost", "127.0.0.1");
        socketOrigins.push(localIpOrigin);
    }

    io = new Server(httpServer, {
        cors: {
            origin: socketOrigins,
            credentials: true
        }
    });

    // Connect to Upstash Redis if configured
    if (process.env.REDIS_URL) {
        pubClient = new Redis(process.env.REDIS_URL, { family: 4 });
        subClient = pubClient.duplicate();

        pubClient.on("error", (err) => console.error("Redis PubClient Error:", err.message));
        subClient.on("error", (err) => console.error("Redis SubClient Error:", err.message));

        io.adapter(createAdapter(pubClient, subClient));
    } else {
        console.error("REDIS_URL is not configured. Socket.io will run without a Redis adapter in single-instance mode.");
    }

    // Authenticate socket connection with Firebase ID token
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error("Authentication error: No token provided"));

            // Development bypass for unit tests / local prototyping
            if (token === "DEV_TEST_TOKEN") {
                socket.user = await User.findOne({ firebaseUid: "firebase_mock_uid_123" });
                return next();
            }

            const decodedToken = await admin.auth().verifyIdToken(token);

            if (decodedToken.email && decodedToken.email_verified === false) {
                return next(new Error("Email not verified"));
            }

            const user = await User.findOne({ firebaseUid: decodedToken.uid });
            if (!user) return next(new Error("User profile not found"));

            socket.user = user;
            next();
        } catch (error) {
            console.error("Socket Auth Error:", error.message);
            next(new Error("Authentication failed"));
        }
    });

    io.on("connection", async (socket) => {
        try {
            const userId = socket.user._id.toString();
            socket.join(userId);

            // Typing indicators
            socket.on("typing_start", ({ receiverId, conversationId }) => {
                socket.to(receiverId).emit("user_typing", { conversationId });
            });

            socket.on("typing_end", ({ receiverId, conversationId }) => {
                socket.to(receiverId).emit("user_stopped_typing", { conversationId });
            });

            // Mark messages as read and notify sender
            socket.on("message:mark-read", async ({ conversationId, messageIds }) => {
                try {
                    if (!conversationId || !Array.isArray(messageIds) || messageIds.length === 0) return;

                    const readerId = userId;

                    await Message.updateMany(
                        {
                            _id: { $in: messageIds },
                            conversationId,
                            senderId: { $ne: readerId },
                            isRead: false
                        },
                        { $set: { isRead: true } }
                    );

                    const affected = await Message.find({ _id: { $in: messageIds } })
                        .select("senderId")
                        .lean();

                    const senderRooms = [
                        ...new Set(
                            affected
                                .map((m) => m.senderId?.toString())
                                .filter((sid) => sid && sid !== readerId)
                        )
                    ];

                    senderRooms.forEach((sid) => {
                        io.to(sid).emit("message:read", {
                            conversationId: conversationId.toString(),
                            messageIds,
                            readerId
                        });
                    });
                } catch (err) {
                    console.error("Error in message:mark-read:", err.stack || err);
                }
            });

            // Update presence status to online
            await User.findByIdAndUpdate(userId, { $set: { "status.online": true } });
            socket.broadcast.emit("presence:update", { userId, online: true });

            socket.on("disconnect", async () => {
                try {
                    const session = activeCalls.get(userId);
                    if (session) {
                        activeCalls.delete(session.callerId);
                        activeCalls.delete(session.receiverId);
                        const duration = session.startTime ? Math.round((Date.now() - session.startTime) / 1000) : 0;
                        await logCallAndEmit(session, duration);

                        const peerId = session.callerId === userId ? session.receiverId : session.callerId;
                        io.to(peerId).emit("webrtc:call-ended");
                    }

                    await User.findByIdAndUpdate(userId, {
                        $set: { "status.online": false, "status.lastSeen": new Date() }
                    });
                    socket.broadcast.emit("presence:update", { userId, online: false, lastSeen: new Date() });
                } catch (err) {
                    console.error("Error in Socket disconnect presence update:", err.stack || err);
                }
            });

            // WebRTC Signaling Switchboard

            // 1. User initiates a call
            socket.on("webrtc:call-user", ({ userToCall, signalData, callerData, callType }) => {
                const session = {
                    callerId: userId,
                    receiverId: userToCall.toString(),
                    callType: callType === "audio" ? "audio" : "video",
                    status: "missed",
                    startTime: null,
                    createdAt: Date.now()
                };
                activeCalls.set(userId, session);
                activeCalls.set(userToCall.toString(), session);

                io.to(userToCall.toString()).emit("webrtc:incoming-call", {
                    signal: signalData,
                    callType: callType === "audio" ? "audio" : "video",
                    caller: {
                        _id: userId,
                        ...callerData
                    }
                });
            });

            // 2. User answers a call
            socket.on("webrtc:answer-call", ({ to, signalData }) => {
                const session = activeCalls.get(userId);
                if (session) {
                    session.startTime = Date.now();
                    session.status = "answered";
                }
                io.to(to.toString()).emit("webrtc:call-accepted", signalData);
            });

            // 3. Exchange ICE candidates
            socket.on("webrtc:ice-candidate", ({ to, candidate }) => {
                io.to(to.toString()).emit("webrtc:ice-candidate", {
                    senderId: userId,
                    candidate
                });
            });

            // 4. Reject call
            socket.on("webrtc:reject-call", ({ to }) => {
                const session = activeCalls.get(userId);
                if (session) {
                    activeCalls.delete(session.callerId);
                    activeCalls.delete(session.receiverId);
                    logCallAndEmit(session, 0);
                }
                io.to(to.toString()).emit("webrtc:call-rejected");
            });

            // 5. End active call
            socket.on("webrtc:end-call", ({ to }) => {
                const session = activeCalls.get(userId);
                if (session) {
                    activeCalls.delete(session.callerId);
                    activeCalls.delete(session.receiverId);
                    const duration = session.startTime ? Math.round((Date.now() - session.startTime) / 1000) : 0;
                    logCallAndEmit(session, duration);
                }
                io.to(to.toString()).emit("webrtc:call-ended");
            });
        } catch (err) {
            console.error("Error in Socket connection handler:", err.stack || err);
        }
    });
    return io;
};

export const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};

export const closeSocket = async () => {
    if (io) {
        await new Promise((resolve) => io.close(resolve));
    }
    if (pubClient) {
        await pubClient.quit();
    }
    if (subClient) {
        await subClient.quit();
    }
};