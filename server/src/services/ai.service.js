import axios from "axios";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { getIO } from "../socket/index.js";

// ⚡ ALGORITHM: Non-blocking Cloud AI Execution (Groq API)
export const processAIResponse = async (conversationId, userMessage, userId, aiUserId) => {
    try {
        const io = getIO();
        
        // 1. Simulate "Typing" state instantly over the Redis socket bus
        io.to(userId.toString()).emit("user_typing", { conversationId });

        // 2. The Cloud Intelligence Bridge
        // Using Groq for blazing-fast, free, low-latency execution
        const GROQ_API_KEY = process.env.GROQ_API_KEY;
        
        if (!GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is missing from environment variables.");
        }

        const humanUser = await User.findById(userId).lean();

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama3-8b-8192", // Lightning-fast model for real-time chat
                messages: [
                    {
                        role: "system",
                        content: `You are Zync AI, an elite coding assistant integrated into the Zync Chat Engine. You are currently assisting ${humanUser.displayName} (@${humanUser.username}). Keep your answers concise, highly technical, and strictly use markdown formatting for code blocks.`,
                    },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 1000
            },
            {
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const aiText = response.data.choices[0].message.content;

        // 3. Save the AI's response to the MongoDB cluster
        const aiMessage = await Message.create({
            conversationId,
            senderId: aiUserId,
            text: aiText,
        });

        // 4. Terminate typing state and broadcast the final message natively
        io.to(userId.toString()).emit("user_stopped_typing", { conversationId });
        io.to(userId.toString()).emit("newMessage", aiMessage);

    } catch (error) {
        console.error("🔴 Cloud AI Engine Error:", error?.response?.data || error.message);
        
        // Fallback gracefully if API rate limit hits
        const io = getIO();
        io.to(userId.toString()).emit("user_stopped_typing", { conversationId });
        
        const errorMessage = await Message.create({
            conversationId,
            senderId: aiUserId,
            text: "_System Notice: Zync Intelligence is currently undergoing maintenance. Please try again in a moment._",
        });
        io.to(userId.toString()).emit("newMessage", errorMessage);
    }
};