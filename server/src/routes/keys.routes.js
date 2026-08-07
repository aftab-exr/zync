import { Router } from "express";
import { registerKeyBundle, fetchKeyBundle, replenishPreKeys } from "../controllers/keys.controller.js";
import { auth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { registerKeyBundleSchema, replenishPreKeysSchema } from "../validators/schemas.js";

const router = Router();

// All routes require authentication
router.use(auth);

// Register/update key bundle
router.post("/register", validate(registerKeyBundleSchema), registerKeyBundle);

// Fetch a user's public key bundle (for X3DH)
router.get("/:userId", fetchKeyBundle);

// Replenish one-time pre-keys
router.post("/prekeys", validate(replenishPreKeysSchema), replenishPreKeys);

export default router;