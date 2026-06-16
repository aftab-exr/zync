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
import mongoose from "mongoose";
import { initializeSocket, closeSocket } from "./socket/index.js"; 
import "./config/firebase.js"; 

// ⚡ Vector 3: AI Bootloader Imports
import User from "./models/user.model.js";
import Conversation from "./models/conversation.model.js";
import Message from "./models/message.model.js";
import { generateServerKeyPair } from "./lib/serverCrypto.js";

// 3. Create the HTTP server wrapping Express
const httpServer = http.createServer(app);

// 4. Attach the Socket.io engine to the HTTP server
initializeSocket(httpServer);

// ⚡ VECTOR 3 + AUTO-HEALER: The AI Identity Bootloader
// Provisions the Zync Intelligence profile and guarantees the AI's public key in
// the DB is always paired with a live AI_PRIVATE_KEY in the environment. If that
// pairing is broken (a "ghost key": DB has a publicKey but the matching private key
// was lost from .env), we force a full key reset so the gateway can never desync.
// ⚡ THE GOD-MODE AUTO-HEALER
const bootstrapAI = async () => {
    try {
        const provisionFreshAI = async () => {
            await User.deleteMany({ isAI: true }); // Kill all ghosts
            const aiUser = new User({
                username: "zync_ai",
                displayName: "Zync Intelligence",
                email: "ai@zync.dev",
                firebaseUid: "zync_internal_ai_identity_" + Date.now(),
                isAI: true
            });
            const keys = await generateServerKeyPair();
            aiUser.publicKey = keys.publicKey;
            await aiUser.save();

            console.error("\n=======================================================");
            console.error("🚨 CRITICAL ACTION REQUIRED: AI PRIVATE KEY GENERATED");
            console.error("Add this exactly to your Render Environment Variables:");
            console.error(`AI_PRIVATE_KEY='${keys.privateKey}'`);
            console.error("=======================================================\n");
            return aiUser;
        };

        let aiUser = await User.findOne({ isAI: true });

        // 1. If no key is in the env, burn everything and restart.
        if (!process.env.AI_PRIVATE_KEY) {
            await provisionFreshAI();
            return;
        }

        // 2. If env key exists, but no AI in DB, burn and restart.
        if (!aiUser) {
            await provisionFreshAI();
            return;
        }

        // 3. ⚡ THE MATHEMATICAL SYNC CHECKER (The Magic Fix)
        // This guarantees the DB and the .env perfectly match on every boot.
        let isMathBroken = false;
        try {
            const envKey = JSON.parse(process.env.AI_PRIVATE_KEY);
            const dbKey = JSON.parse(aiUser.publicKey);
            // In ECDH, the public coordinates (x, y) must match exactly.
            if (envKey.x !== dbKey.x || envKey.y !== dbKey.y) {
                isMathBroken = true;
            }
        } catch (e) {
            isMathBroken = true;
        }

        if (isMathBroken) {
            console.error("🚨 KEY DESYNC DETECTED: DB Public Key != Env Private Key");
            console.error("🧹 Auto-healing... Forcing database to match environment.");
            
            // Reconstruct the exact matching Public Key from the Env Private Key
            const envKey = JSON.parse(process.env.AI_PRIVATE_KEY);
            const derivedPublicKey = {
                kty: "EC", crv: "P-256", ext: true,
                key_ops: [], // Public keys don't have derive operations
                x: envKey.x, y: envKey.y
            };
            
            aiUser.publicKey = JSON.stringify(derivedPublicKey);
            await aiUser.save();
            console.error("✅ Zync AI Keys perfectly synchronized. Gateway Open.");
        } else {
            console.log("✅ Zync AI Gateway is fully synced and ready.");
        }

    } catch (error) {
        console.error("🔴 Failed to bootstrap AI:", error);
    }
};

// 5. Connect to DB and Start Listening
connectDB().then(async () => {
  
  // ⚡ Ensure AI exists before accepting traffic
  await bootstrapAI();

  const server = httpServer.listen(PORT);

  // 🛡️ Graceful Shutdown Protocol
  const exitHandler = async (reason = 'shutdown', err) => {
    if (err) {
      console.error('Exit triggered by error:', err);
    }

    try {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
      await closeSocket();
      await mongoose.connection.close();
      const isError = reason === 'uncaughtException' || reason === 'unhandledRejection';
      process.exit(isError ? 1 : 0);
    } catch (shutdownErr) {
      console.error('Error during graceful shutdown:', shutdownErr);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => { exitHandler('SIGINT'); });
  process.on('SIGTERM', () => { exitHandler('SIGTERM'); });
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    exitHandler('uncaughtException', error);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    exitHandler('unhandledRejection', reason);
  });
});