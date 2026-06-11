import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getConversations, createConversation, createGroupConversation } from "../controllers/conversation.controller.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", getConversations);
router.post("/", createConversation);
router.post("/group", createGroupConversation); // ⚡ Phase 2.3 Group Route

export default router;