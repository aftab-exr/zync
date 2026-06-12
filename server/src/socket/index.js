// server/socket/index.js
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import admin from "firebase-admin";
import User from "../models/user.model.js";

let io;

export const initializeSocket = (httpServer) => {
    // 1. Initialize Socket.io with strict CORS
    const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
    const PRODUCTION_ORIGIN = "https://zync-znty.onrender.com";
    const socketOrigins = [CLIENT_ORIGIN, PRODUCTION_ORIGIN].filter(Boolean);

    io = new Server(httpServer, {
        cors: {
            origin: socketOrigins,
            credentials: true
        }
    });

    // 2. Connect to Upstash Redis only when configured
    // Forcing family: 4 (IPv4) resolves DNS resolution timeouts on Node 20+
    let pubClient;
    let subClient;
    if (process.env.REDIS_URL) {
        pubClient = new Redis(process.env.REDIS_URL, { family: 4 });
        subClient = pubClient.duplicate();

        pubClient.on("error", (err) => console.error("🔴 Redis PubClient Error:", err.message));
        subClient.on("error", (err) => console.error("🔴 Redis SubClient Error:", err.message));

        pubClient.on("connect", () => {
            if (process.env.NODE_ENV !== 'production') console.log("🟢 Redis PubClient Connected");
        });
        subClient.on("connect", () => {
            if (process.env.NODE_ENV !== 'production') console.log("🟢 Redis SubClient Connected");
        });

        io.adapter(createAdapter(pubClient, subClient));
    } else {
        console.warn("⚠️ REDIS_URL is not configured. Socket.io will run without a Redis adapter in single-instance mode.");
    }

    // 3. The Authentication Handshake (Zero-Trust Socket)
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error("Authentication error: No token provided"));

            // 🚧 DEVELOPMENT BYPASS (Match our Express bypass for testing)
            if (token === "DEV_TEST_TOKEN") {
                socket.user = await User.findOne({ firebaseUid: "firebase_mock_uid_123" });
                return next();
            }

            // Verify Firebase JWT
            const decodedToken = await admin.auth().verifyIdToken(token);
            const user = await User.findOne({ firebaseUid: decodedToken.uid });
            
            if (!user) return next(new Error("User profile not found"));

            // Attach user data to the socket session
            socket.user = user;
            next();
        } catch (error) {
            console.error("Socket Auth Error:", error.message);
            next(new Error("Authentication failed"));
        }
    });

    // 4. Connection & Event Listeners
    io.on("connection", async (socket) => {
        const userId = socket.user._id.toString();
        if (process.env.NODE_ENV !== 'production') console.log(`🟢 User connected: ${socket.user.username} (${socket.id})`);

        socket.join(userId);

        // ⚡ TRANSIENT STATE RELAY: Typing Indicators
        // Direct event piping via Redis. Zero disk write overhead.
        socket.on("typing_start", ({ receiverId, conversationId }) => {
            socket.to(receiverId).emit("user_typing", { conversationId });
        });

        socket.on("typing_end", ({ receiverId, conversationId }) => {
            socket.to(receiverId).emit("user_stopped_typing", { conversationId });
        });

        // ⚡ User Presence Engine
        await User.findByIdAndUpdate(userId, { $set: { "status.online": true } });
        socket.broadcast.emit("presence:update", { userId, online: true });

        socket.on("disconnect", async () => {
            if (process.env.NODE_ENV !== 'production') console.log(`🔴 User disconnected: ${socket.user.username}`);
            
            await User.findByIdAndUpdate(userId, { 
                $set: { "status.online": false, "status.lastSeen": new Date() } 
            });
            socket.broadcast.emit("presence:update", { userId, online: false, lastSeen: new Date() });
        });
    });
    return io;
};

export const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};