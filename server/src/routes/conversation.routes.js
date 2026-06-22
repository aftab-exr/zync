import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { getConversations, createConversation, createGroupConversation } from "../controllers/conversation.controller.js";

const router = Router();

router.use(authenticateUser);

router.get("/", getConversations);
router.post("/", createConversation);
router.post("/group", createGroupConversation);

export default router;