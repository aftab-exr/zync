import express from "express";
import authenticateUser from "../middlewares/auth.middleware.js";
import { AI_MODEL, AI_SYSTEM_PROMPT } from "../constants/constants.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

// SSE streaming proxy to Groq
router.post("/chat/completions", authenticateUser, asyncHandler(async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is not configured." });
    }

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
        model: req.body.model || AI_MODEL,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          ...req.body.messages,
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
});

export default router;