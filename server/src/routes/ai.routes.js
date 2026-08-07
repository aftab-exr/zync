import express from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { AI_MODEL, AI_SYSTEM_PROMPT } from "../constants/constants.js";
import asyncHandler from "../utils/asyncHandler.js";

import apiError from "../utils/apiError.js";

const router = express.Router();

const ALLOWED_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama3-70b-8192",
  "llama3-8b-8192",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
  "deepseek-r1-distill-llama-70b",
]);

// SSE streaming proxy to Groq
router.post("/chat/completions", authenticateUser, asyncHandler(async (req, res, next) => {
  if (!process.env.GROQ_API_KEY) {
    throw new apiError(500, "GROQ_API_KEY is not configured.");
  }

  const { model, messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new apiError(400, "Messages array is required.");
  }

  const selectedModel = (model && ALLOWED_MODELS.has(model)) ? model : AI_MODEL;

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          ...messages,
        ],
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error("Groq API error:", errText);
      return res.status(groqResponse.status).end();
    }

    const reader = groqResponse.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.write("data: [DONE]\n\n");
        break;
      }
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (error) {
    console.error("AI route error:", error);
    res.status(500).end();
  }
}));

export default router;