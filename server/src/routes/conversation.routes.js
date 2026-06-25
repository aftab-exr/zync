import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createConversationSchema, createGroupConversationSchema } from "../validators/schemas.js";
import { getConversations, createConversation, createGroupConversation } from "../controllers/conversation.controller.js";

const router = Router();

router.use(authenticateUser);

router.get("/", getConversations);
router.post("/", validate(createConversationSchema), createConversation);
router.post("/group", validate(createGroupConversationSchema), createGroupConversation);

export default router;