import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { sendMessage, getMessages } from "../controllers/message.controller.js";

const router = Router();

router.get("/:conversationId", authenticateUser, getMessages);
router.post("/:conversationId", authenticateUser, sendMessage);

export default router;