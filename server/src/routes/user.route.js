import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import {
  setupProfile,
  searchUsers,
  getMe,
  updatePublicKey
} from "../controllers/user.controller.js";

const router = Router();

router.post("/setup", authenticateUser, setupProfile);
router.get("/search", authenticateUser, searchUsers);
router.get("/me", authenticateUser, getMe);

// ⚡ PHASE 3.0: Register the Key Upload Route
router.post("/keys", authenticateUser, updatePublicKey);

export default router;
