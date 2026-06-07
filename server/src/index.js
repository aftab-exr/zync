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
// ... [Keep your top imports and setup] ...

connectDB().then(() => {
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
        // Exit with non-zero code for errors, zero for normal signals
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