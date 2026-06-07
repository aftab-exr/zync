import express from "express";
import cors from "cors";
import cookieparser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
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

export default app;