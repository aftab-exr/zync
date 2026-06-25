import { Router } from "express";
import multer from "multer";
import authenticateUser from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  sendMessageSchema,
  getMessagesSchema,
  editMessageSchema,
  deleteMessageSchema,
} from "../validators/schemas.js";
import { UPLOAD_MAX_BYTES } from "../constants/constants.js";
import {
  sendMessage,
  getMessages,
  clearMessages,
  uploadAttachment,
  editMessage,
  deleteMessageForEveryone,
  deleteMessageForMe,
} from "../controllers/message.controller.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES },
});

// Encrypted media upload
router.post("/upload", authenticateUser, upload.single("file"), uploadAttachment);

// Clear all chats — declared before /:conversationId so the literal path isn't shadowed
router.delete("/clear", authenticateUser, clearMessages);

router.get("/:conversationId", authenticateUser, validate(getMessagesSchema), getMessages);
router.post("/:conversationId", authenticateUser, validate(sendMessageSchema), sendMessage);

router.put("/:messageId/edit", authenticateUser, validate(editMessageSchema), editMessage);
router.delete("/:messageId/everyone", authenticateUser, validate(deleteMessageSchema), deleteMessageForEveryone);
router.delete("/:messageId/me", authenticateUser, validate(deleteMessageSchema), deleteMessageForMe);

export default router;