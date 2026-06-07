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
import { initializeSocket } from "./socket/index.js"; // Ensure this path is correct
import "./config/firebase.js"; // Boot the Firebase Admin engine

// 3. Create the HTTP server wrapping Express
const httpServer = http.createServer(app);

// 4. Attach the Socket.io engine to the HTTP server
initializeSocket(httpServer);

// 5. Connect to DB and Start Listening
connectDB().then(() => {
  // BUG FIX: Must use httpServer.listen, NOT app.listen
  httpServer.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🚀 Zync Server running on port ${PORT}`);
      console.log(`⚡ Real-Time Socket Engine Active`);
    }
  });
});