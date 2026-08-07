import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  registerKeyBundleSchema,
  replenishPreKeysSchema,
} from "../validators/schemas.js";
import {
  registerKeyBundle,
  getKeyBundle,
  replenishPreKeys,
} from "../controllers/key.controller.js";

const router = Router();

router.use(authenticateUser);

router.post("/register", validate(registerKeyBundleSchema), registerKeyBundle);
router.get("/:userId", getKeyBundle);
router.post("/prekeys", validate(replenishPreKeysSchema), replenishPreKeys);

export default router;
