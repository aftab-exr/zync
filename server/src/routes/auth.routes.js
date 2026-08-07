import { Router } from "express";
import { login, refresh, logout, getDevices, revokeDevice } from "../controllers/auth.controller.js";
import authenticateUser from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { loginSchema } from "../validators/schemas.js";

const router = Router();

router.post("/login", validate(loginSchema), login);
router.post("/refresh", refresh);
router.post("/logout", logout);

router.get("/devices", authenticateUser, getDevices);
router.delete("/devices/:deviceId", authenticateUser, revokeDevice);

export default router;
