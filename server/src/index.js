import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// 1. MUST BE FIRST: Load environment variables before importing other local files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "config", ".env")
});

// 2. NOW import the rest of the application
import app from "./app.js";
import { PORT } from "./constants/constants.js";
import { connectDB } from "../database/connection.js";
import http from "http";
import { initializeSocket } from "./socket/index.js"; 
import "./config/firebase.js"; 

// ⚡ Vector 3: AI Bootloader Imports
import User from "./models/user.model.js";
import { generateServerKeyPair } from "./lib/serverCrypto.js";

// 3. Create the HTTP server wrapping Express
const httpServer = http.createServer(app);

// 4. Attach the Socket.io engine to the HTTP server
initializeSocket(httpServer);

// ⚡ VECTOR 3: The AI Identity Bootloader
const bootstrapAI = async () => {
    try {
        await User.deleteOne({ isAI: true })
        let aiUser = await User.findOne({ isAI: true });
        if (!aiUser) {
            aiUser = new User({
                username: "zync_ai",
                displayName: "Zync Intelligence",
                email: "ai@zync.dev",
                firebaseUid: "zync_internal_ai_identity_" + Date.now(),
                isAI: true
            });
            await aiUser.save();
            console.log("⚡ Bootstrapped Zync Intelligence Profile.");
        }

        if (!aiUser.publicKey) {
            console.log("🔒 Generating Zero-Knowledge Keypair for AI Gateway...");
            const keys = await generateServerKeyPair();
            aiUser.publicKey = keys.publicKey;
            await aiUser.save({ returnDocument: 'after' });

            console.log("\n=======================================================");
            console.log("🚨 CRITICAL ACTION REQUIRED: AI PRIVATE KEY GENERATED");
            console.log("=======================================================");
            console.log("Add the following line to your server/src/config/.env file:");
            console.log(`AI_PRIVATE_KEY='${keys.privateKey}'`);
            console.log("=======================================================\n");
        } else {
            if (!process.env.AI_PRIVATE_KEY) {
                console.log("⚠️ WARNING: AI_PRIVATE_KEY is missing from .env but AI User exists.");
            }
        }
    } catch (error) {
        console.error("🔴 Failed to bootstrap AI:", error);
    }
};

// 5. Connect to DB and Start Listening
connectDB().then(async () => {
  
  // ⚡ Ensure AI exists before accepting traffic
  await bootstrapAI();

  const server = httpServer.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🚀 Zync Server v1.0.0 running on port ${PORT}`);
      console.log(`⚡ Real-Time Socket Engine Active`);
    }
  });

  // 🛡️ Graceful Shutdown Protocol
  const exitHandler = (reason = 'shutdown', err) => {
    if (err) {
      console.error('Exit triggered by error:', err);
    } else if (reason) {
      console.log('Exit triggered by:', reason);
    }

    if (server) {
      server.close(() => {
        console.log('🛑 Server closed gracefully.');
        const isError = reason === 'uncaughtException' || reason === 'unhandledRejection';
        process.exit(isError ? 1 : 0);
      });
    } else {
      const isError = reason === 'uncaughtException' || reason === 'unhandledRejection';
      process.exit(isError ? 1 : 0);
    }
  };

  process.on('SIGINT', () => exitHandler('SIGINT'));
  process.on('SIGTERM', () => exitHandler('SIGTERM'));
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    exitHandler('uncaughtException', error);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    exitHandler('unhandledRejection', reason);
  });
});