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
const bootstrapAI = async () => {
    try {
        // Helper: forge a brand-new AI identity + fresh keypair and surface the
        // private key to the admin. Used for first-boot AND ghost-key recovery.
        const provisionFreshAI = async () => {
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
            console.error("=======================================================");
            console.error("Add the following line to your server/src/config/.env file");
            console.error("(then restart the server) so the AI Gateway can read messages:");
            console.error(`AI_PRIVATE_KEY='${keys.privateKey}'`);
            console.error("=======================================================\n");
            return aiUser;
        };

        // ⚡ SINGLETON ENFORCER: if no private key is configured in the env, every
        // existing AI profile is a guaranteed ghost (DB publicKey with no matching
        // private key). Purge ALL of them up front so we can mint exactly one fresh,
        // self-consistent identity below — no duplicate/ghost AI profiles can survive.
        if (!process.env.AI_PRIVATE_KEY) {
            await User.deleteMany({ isAI: true });
        }

        const aiUser = await User.findOne({ isAI: true });
        const hasPrivateKey = !!(process.env.AI_PRIVATE_KEY && process.env.AI_PRIVATE_KEY.trim());

        if (!aiUser) {
            // First boot: no AI profile exists yet.
            await provisionFreshAI();
            return;
        }

        // ⚡ AUTO-HEALER: AI exists, but the private key is missing/empty in the env.
        // The DB publicKey is now a ghost (no matching private key) → force a reset
        // by wiping the stale profile and minting a fresh, self-consistent keypair.
        if (!hasPrivateKey) {
            console.error("🔴 AI User exists but AI_PRIVATE_KEY is missing/empty. Forcing key reset to clear ghost keys.");
            await User.deleteOne({ isAI: true });
            await provisionFreshAI();
            return;
        }

        // AI exists and we hold a private key — but the DB may have lost its publicKey
        // (e.g. partial wipe). Regenerate just the keypair if so.
        if (!aiUser.publicKey) {
            const keys = await generateServerKeyPair();
            aiUser.publicKey = keys.publicKey;
            await aiUser.save();

            console.error("\n=======================================================");
            console.error("🚨 CRITICAL ACTION REQUIRED: AI PRIVATE KEY REGENERATED");
            console.error("=======================================================");
            console.error("Replace AI_PRIVATE_KEY in server/src/config/.env with:");
            console.error(`AI_PRIVATE_KEY='${keys.privateKey}'`);
            console.error("=======================================================\n");
            return;
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