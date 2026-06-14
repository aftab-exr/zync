import express from "express";
import cors from "cors";
import cookieparser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import apiResponse from "./utils/apiResponse.js";
import userRoutes from "./routes/user.route.js";
import conversationRoutes from "./routes/conversation.routes.js";
import messageRoutes from "./routes/message.routes.js";

const app = express();

app.use(
  helmet({
    // ⚡ THE FIX: Allow the main window to receive tokens from the Firebase popup
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
          "wss://zync-znty.onrender.com"
        ],
        frameSrc: ["'self'", "https://*.firebaseapp.com", "https://identitytoolkit.googleapis.com"],
        imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"],
        upgradeInsecureRequests: [],
      },
    },
  })
);
// Enable gzip/brotli compression for responses (production-friendly)
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const PRODUCTION_ORIGIN = "https://zync-znty.onrender.com";
const allowedOrigins = [CLIENT_ORIGIN, PRODUCTION_ORIGIN].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(cookieparser());

// ROUTES
app.use("/api/v1/users",userRoutes);
app.use("/api/v1/conversations",conversationRoutes);
app.use("/api/v1/messages", messageRoutes);

// Health Checking Endpoint
app.get("/health",(req,res)=>{
    res.status(200).json(new apiResponse(200,"Enterprise Engine Humming",{}))
})

// Global Error Handler Middleware
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json(new apiResponse(statusCode, message, err.errors || {}));
});

// 🚀 ALGORITHM: Unified Production Serving
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === "production") {
    // 1. Serve the static React build files
    app.use(express.static(path.join(__dirname, "../../client/dist")));

    // 2. Catch-all route to hand over routing to React Router
    // Use a RegExp route to avoid path-to-regexp string parsing issues in Express v5
    app.get(/.*/, (req, res) => {
        res.sendFile(path.resolve(__dirname, "../../client/dist", "index.html"));
    });
}

export default app;