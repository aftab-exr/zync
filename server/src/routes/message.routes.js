import { Router } from "express";
import multer from "multer";
import authenticateUser from "../middlewares/auth.middleware.js";
import { sendMessage, getMessages, clearMessages, uploadAttachment } from "../controllers/message.controller.js";

const router = Router();

// ⚡ PHASE 2: In-memory upload (we forward the buffer straight to Cloudinary).
// 50MB ceiling comfortably covers a 20MB compressed image plus AES-GCM overhead,
// short videos, and voice notes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ⚡ PHASE 2: Encrypted media upload (raw Cloudinary asset).
router.post("/upload", authenticateUser, upload.single("file"), uploadAttachment);

// ⚡ PHASE 1: Clear all chats. Declared before the "/:conversationId" params so
// the literal path is never shadowed by the dynamic segment.
router.delete("/clear", authenticateUser, clearMessages);

router.get("/:conversationId", authenticateUser, getMessages);
router.post("/:conversationId", authenticateUser, sendMessage);

export default router;