import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load env before any other local imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "config", ".env") });

import { validateEnv } from "./config/env.js";
validateEnv();

import app from "./app.js";
import { PORT } from "./constants/constants.js";
import { connectDB } from "../database/connection.js";
import http from "http";
import mongoose from "mongoose";
import { initializeSocket, closeSocket } from "./socket/index.js";
import "./config/firebase.js";

import User from "./models/user.model.js";

const httpServer = http.createServer(app);

// Ensures the AI user profile exists in DB
const bootstrapAI = async () => {
  try {
    let aiUser = await User.findOne({ isAI: true });
    if (!aiUser) {
      await provisionFreshAI();
    }
  } catch (error) {
    console.error("Failed to bootstrap AI user:", error);
  }
};

async function provisionFreshAI() {
  await User.deleteMany({ isAI: true });
  await new User({
    username: "zync_ai",
    displayName: "Zync Intelligence",
    email: "ai@zync.dev",
    firebaseUid: "zync_internal_ai_" + Date.now(),
    isAI: true,
  }).save();

  console.log("AI Assistant user provisioned successfully.");
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