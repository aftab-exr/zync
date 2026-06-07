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

app.use(helmet());
// Enable gzip/brotli compression for responses (production-friendly)
app.use(compression());
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(cookieparser());

// ROUTES
app.use("/api/v1/users",userRoutes);
app.use("/api/v1/conversations",conversationRoutes);
app.use("/api/v1/messages", messageRoutes);

// Health Checking Endpoint
app.get("/health",(req,res)=>{
    res.status(200).json(new apiResponse(200,"Enterprise Engine Humming",{}))
})

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