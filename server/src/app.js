import express from "express";
import cors from "cors";
import cookieparser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";

import { getAllowedOrigins, PAYLOAD_LIMIT } from "./constants/constants.js";
import logger from "./middlewares/logger.middleware.js";
import { initRedisRateLimiter, restLimiters } from "./services/rateLimiter.js";
import apiResponse from "./utils/apiResponse.js";
import userRoutes from "./routes/user.route.js";
import conversationRoutes from "./routes/conversation.routes.js";
import messageRoutes from "./routes/message.routes.js";
import aiRoutes from "./routes/ai.routes.js";

const app = express();

// Request logging
app.use(logger);

// Initialize Redis rate limiter
initRedisRateLimiter(process.env.REDIS_URL);

// Rate limiting using Redis sliding window
app.use(restLimiters.global);

// Security headers
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://apis.google.com", "https://www.gstatic.com"],
        scriptSrcElem: ["'self'", "'unsafe-inline'", "https://apis.google.com", "https://www.gstatic.com"],
        connectSrc: [
          "'self'",
          "https://*.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://zync-znty.onrender.com",
          "wss://zync-znty.onrender.com",
          "https://res.cloudinary.com",
        ],
        frameSrc: ["'self'", "https://*.firebaseapp.com", "https://identitytoolkit.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com", "https://res.cloudinary.com"],
        mediaSrc: ["'self'", "blob:"],
        upgradeInsecureRequests: [],
      },
    },
  })
);

app.use(compression());
app.use(express.json({ limit: PAYLOAD_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: PAYLOAD_LIMIT }));
app.use(cors({ origin: getAllowedOrigins(), credentials: true }));
app.use(cookieparser());

// Explicitly set COOP and COEP headers to support Firebase auth popups
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

// Routes
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/conversations", conversationRoutes);
app.use("/api/v1/messages", restLimiters.messageSend);
app.use("/api/v1/messages", messageRoutes);
app.use("/api/v1/ai", aiRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json(new apiResponse(200, "OK", {}));
});

// Production: serve the React build
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../../client/dist")));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.resolve(__dirname, "../../client/dist", "index.html"));
  });
}

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(statusCode).json(new apiResponse(statusCode, message, err.errors || {}));
});

export default app;