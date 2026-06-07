// server/socket/index.js
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import admin from "firebase-admin";
import User from "../models/user.model.js";

let io;

export const initializeSocket = (httpServer) => {
    // 1. Initialize Socket.io with strict CORS
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
            credentials: true
        }
    });

    // 2. Connect to Upstash Redis
    // Forcing family: 4 (IPv4) resolves DNS resolution timeouts on Node 20+
    const pubClient = new Redis(process.env.REDIS_URL, { family: 4 });
    const subClient = pubClient.duplicate();

    // Catch errors so the server doesn't fatally crash
    pubClient.on("error", (err) => console.error("🔴 Redis PubClient Error:", err.message));
    subClient.on("error", (err) => console.error("🔴 Redis SubClient Error:", err.message));
    
    pubClient.on("connect", () => {
        if (process.env.NODE_ENV !== 'production') console.log("🟢 Redis PubClient Connected");
    });
    subClient.on("connect", () => {
        if (process.env.NODE_ENV !== 'production') console.log("🟢 Redis SubClient Connected");
    });
    
    // Attach the Redis Adapter so messages broadcast across all server instances
    io.adapter(createAdapter(pubClient, subClient));

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

        // ⚡ FIX 3: Use strict $set to safely update the nested field
        await User.findByIdAndUpdate(userId, { $set: { "status.online": true } });
        
        socket.broadcast.emit("presence:update", { userId, online: true });

        socket.on("disconnect", async () => {
            if (process.env.NODE_ENV !== 'production') console.log(`🔴 User disconnected: ${socket.user.username}`);
            // ⚡ FIX 4: Use strict $set here as well
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