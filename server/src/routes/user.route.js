import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  setupProfileSchema,
  updateProfileSchema,
  updatePublicKeySchema,
  updateFCMTokenSchema,
} from "../validators/schemas.js";
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

router.post("/setup", authenticateUser, validate(setupProfileSchema), setupProfile);
router.get("/search", authenticateUser, searchUsers);
router.get("/me", authenticateUser, getMe);
router.patch("/profile", authenticateUser, validate(updateProfileSchema), updateProfile);
router.patch("/avatar", authenticateUser, updateAvatar);
router.post("/keys", authenticateUser, validate(updatePublicKeySchema), updatePublicKey);
router.patch("/update-fcm", authenticateUser, validate(updateFCMTokenSchema), updateFCMToken);

export default router;
