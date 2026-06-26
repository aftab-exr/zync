import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "src", "config", ".env") });

import { connectDB } from "./database/connection.js";
import User from "./src/models/user.model.js";
import Conversation from "./src/models/conversation.model.js";
import Message from "./src/models/message.model.js";

async function run() {
  await connectDB();
  const users = await User.find({}).lean();
  console.log("Users:", users.map(u => ({ _id: u._id, username: u.username, firebaseUid: u.firebaseUid })));

  const conversations = await Conversation.find({}).lean();
  console.log("Conversations:", conversations);

  await mongoose.connection.close();
}

run().catch(console.error);
