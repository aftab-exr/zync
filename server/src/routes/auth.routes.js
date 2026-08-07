import { Router } from "express";
import { authLimiter } from "../middlewares/rateLimit.middleware.js";
import { login, refresh, logout } from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { loginSchema, refreshSchema, logoutSchema } from "../validators/schemas.js";

const router = Router();

// Rate-limited auth routes (10 req/min per IP)
router.use(authLimiter);

router.post("/login", validate(loginSchema), login);
router.post("/refresh", validate(refreshSchema), refresh);
router.post("/logout", validate(logoutSchema), logout);

export default router;