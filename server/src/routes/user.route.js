import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import {
  setupProfile,
  searchUsers,
  getMe,
  updateProfile,
  updateAvatar,
  updatePublicKey,
  updateFCMToken,
} from "../controllers/user.controller.js";

const router = Router();

router.post("/setup", authenticateUser, setupProfile);
router.get("/search", authenticateUser, searchUsers);
router.get("/me", authenticateUser, getMe);
router.patch("/profile", authenticateUser, updateProfile);
router.patch("/avatar", authenticateUser, updateAvatar);
router.post("/keys", authenticateUser, updatePublicKey);
router.patch("/update-fcm", authenticateUser, updateFCMToken);

export default router;
