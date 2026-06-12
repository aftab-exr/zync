import Groq from "groq-sdk";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import { getIO } from "../socket/index.js";

// Initialize Groq (Ensure GROQ_API_KEY is in your .env)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Utility for Exponential Backoff
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Saves a message to the database and broadcasts it to all participants in the group/DM
 */
const saveAndBroadcastMessage = async (conversationId, text, senderId) => {
    try {
        const newMessage = await Message.create({ conversationId, senderId, text });
        
        const conversation = await Conversation.findByIdAndUpdate(
            conversationId, 
            { lastMessageAt: new Date(), lastMessageId: newMessage._id },
            { new: true }
        );

        const io = getIO();
        for (const participantId of conversation.participants) {
            io.to(participantId.toString()).emit("newMessage", newMessage);
        }
    } catch (error) {
        console.error("🔴 AI Broadcast Error: Failed to save fallback message", error);
    }
};

export const processAIResponse = async (conversationId, userText, humanId, aiUserId) => {
    let attempt = 0;
    const maxRetries = 3;
    const baseDelay = 1500; // Start with 1.5 seconds

    // ⚡ THE FIX: The Exponential Backoff Loop
    while (attempt < maxRetries) {
        try {
            // Attempt to fetch from Groq Llama 3.3
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: "user", content: userText }],
                model: "llama-3.3-70b-versatile",
                temperature: 0.7,
                max_tokens: 1024,
            });

            const aiResponseText = chatCompletion.choices[0]?.message?.content || "I have no words.";

            // Success! Send the AI's response to the chat
            await saveAndBroadcastMessage(conversationId, aiResponseText, aiUserId);
            return; // Exit the loop entirely

        } catch (error) {
            attempt++;
            
            // Extract the specific Groq API error
            const isOverCapacity = error.error?.type === 'internal_server_error' || error.status === 429 || error.status === 503;
            
            console.warn(`⚠️ Groq API Error (Attempt ${attempt}/${maxRetries}):`, error.error?.message || error.message);

            if (isOverCapacity && attempt < maxRetries) {
                // Calculate exponential backoff (1.5s, 3s, 6s) + random jitter to prevent thundering herd
                const delay = (baseDelay * Math.pow(2, attempt - 1)) + (Math.random() * 500);
                console.log(`⏳ Backing off for ${Math.round(delay)}ms before retry...`);
                await sleep(delay);
            } else {
                // ⚡ GRACEFUL DEGRADATION: Instead of silently failing, the AI agent replies with an error
                let fallbackText = "⚡ *System Alert:* My neural pathways experienced a critical fault. Please try again.";
                
                if (isOverCapacity) {
                    fallbackText = "⚡ *System Alert:* My quantum processors (Llama 3.3) are currently over capacity due to high network traffic. Please wait a few moments and try your request again.";
                }

                await saveAndBroadcastMessage(conversationId, fallbackText, aiUserId);
                return; // Exit after fallback
            }
        }
    }
};