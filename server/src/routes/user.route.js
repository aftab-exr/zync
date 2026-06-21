import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import {
  setupProfile,
  searchUsers,
  getMe,
  updateProfile,
  updateAvatar,
  updatePublicKey,
  updateFCMToken
} from "../controllers/user.controller.js";

const router = Router();

router.post("/setup", authenticateUser, setupProfile);
router.get("/search", authenticateUser, searchUsers);
router.get("/me", authenticateUser, getMe);

// ⚡ PHASE 1: Rate-limited profile mutation (14d displayName / 60d username)
router.patch("/profile", authenticateUser, updateProfile);

// ⚡ PHASE 1: Avatar upload (Cloudinary → avatarUrl)
router.patch("/avatar", authenticateUser, updateAvatar);

// ⚡ PHASE 3.0: Register the Key Upload Route
router.post("/keys", authenticateUser, updatePublicKey);

// ⚡ Silent push notification token update route
router.patch("/update-fcm", authenticateUser, updateFCMToken);

export default router;
