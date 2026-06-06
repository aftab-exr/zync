import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { setupProfile, searchUsers } from "../controllers/user.controller.js";

const router = Router();

router.post("/setup", authenticateUser,setupProfile);
router.get("/search", authenticateUser, searchUsers);

export default router;