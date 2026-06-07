import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { createOrGetDM, getUserConversations } from "../controllers/conversation.controller.js";

const router = Router();

// Retrieve all active conversations for the sidebar
router.get("/", authenticateUser, getUserConversations);

// Create or fetch a specific DM thread
router.post("/", authenticateUser, createOrGetDM);

export default router;