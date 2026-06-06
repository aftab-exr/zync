import { Router } from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { createOrGetDM } from "../controllers/conversation.controller.js";

const router = Router();

router.post("/", authenticateUser, createOrGetDM);

export default router;