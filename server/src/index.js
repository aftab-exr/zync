import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load env before any other local imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "config", ".env") });

import app from "./app.js";
import { PORT } from "./constants/constants.js";
import { connectDB } from "../database/connection.js";
import http from "http";
import mongoose from "mongoose";
import { initializeSocket, closeSocket } from "./socket/index.js";
import "./config/firebase.js";

import User from "./models/user.model.js";
import { generateServerKeyPair } from '@zync/crypto';

const httpServer = http.createServer(app);

// Ensures the AI user profile exists and its keys match the environment.
// If the env private key is missing or doesn't match the DB public key,
// we either provision a new AI identity or re-derive the public key.
const bootstrapAI = async () => {
  try {
    if (!process.env.AI_PRIVATE_KEY) {
      await provisionFreshAI();
      return;
    }

    let aiUser = await User.findOne({ isAI: true });
    if (!aiUser) {
      await provisionFreshAI();
      return;
    }

    // Compare env private key coords with DB public key coords
    let keysMatch = false;
    try {
      const envKey = JSON.parse(process.env.AI_PRIVATE_KEY);
      const dbKey = JSON.parse(aiUser.publicKey);
      keysMatch = envKey.x === dbKey.x && envKey.y === dbKey.y;
    } catch {
      keysMatch = false;
    }

    if (!keysMatch) {
      console.log("AI key mismatch — re-syncing public key from env.");
      const envKey = JSON.parse(process.env.AI_PRIVATE_KEY);
      aiUser.publicKey = JSON.stringify({
        kty: "EC", crv: "P-256", ext: true, key_ops: [],
        x: envKey.x, y: envKey.y,
      });
      await aiUser.save();
      console.log("AI keys synced.");
    }
  } catch (error) {
    console.error("Failed to bootstrap AI:", error);
  }
};

async function provisionFreshAI() {
  await User.deleteMany({ isAI: true });
  const keys = await generateServerKeyPair();
  await new User({
    username: "zync_ai",
    displayName: "Zync Intelligence",
    email: "ai@zync.dev",
    firebaseUid: "zync_internal_ai_" + Date.now(),
    isAI: true,
    publicKey: keys.publicKey,
  }).save();

  console.log("\n=== AI PRIVATE KEY GENERATED ===");
  console.log(`Add to your env: AI_PRIVATE_KEY='${keys.privateKey}'`);
  console.log("================================\n");
}

// Boot
connectDB().then(async () => {
  await initializeSocket(httpServer);
  await bootstrapAI();
  const server = httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);
    try {
      if (server) await new Promise((r) => server.close(r));
      await closeSocket();
      await mongoose.connection.close();
      process.exit(0);
    } catch (err) {
      console.error("Shutdown error:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
    shutdown("unhandledRejection");
  });
});