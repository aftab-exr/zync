import express from 'express';
import authenticateUser from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/chat/completions', authenticateUser, async (req, res) => {
    try {
        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ error: "System Warning: Neural link offline. Missing GROQ_API_KEY." });
        }

        // 1. Tell the Zync frontend to expect a live stream
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 2. Forward the exact request to Groq, injecting your secure system prompt
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: req.body.model || "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: "You are Zync Intelligence, a highly advanced, concise, and helpful AI embedded directly into an encrypted PWA focus station. Keep answers clean, code well-formatted, and do not use generic AI intro phrases." 
                    },
                    ...req.body.messages // Pass the user's chat history
                ],
                temperature: 0.7,
                stream: true // ⚡ CRITICAL: Forces Groq to stream
            })
        });

        if (!groqResponse.ok) {
            const errText = await groqResponse.text();
            console.error("🔴 Groq Proxy Error:", errText);
            return res.status(groqResponse.status).end();
        }

        // 3. Pipe the incoming Groq stream directly out to the Zync frontend
        const reader = groqResponse.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                res.write('data: [DONE]\n\n');
                break;
            }
            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
        }
        res.end();

    } catch (error) {
        console.error("🔴 Fatal AI Route Error:", error);
        res.status(500).end();
    }
});

export default router;