export const generateAIResponse = async (prompt) => {
    try {
        if (!process.env.GROQ_API_KEY) {
            console.warn("⚠️ GROQ_API_KEY is missing. AI will not respond.");
            return "System Warning: Neural link offline. Please configure GROQ_API_KEY in the server environment.";
        }

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: "You are Zync Intelligence, a highly advanced, concise, and helpful AI embedded directly into an encrypted PWA focus station. Keep answers clean, code well-formatted, and do not use generic AI intro phrases." 
                    },
                    { 
                        role: "user", 
                        content: prompt 
                    }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });
        
        if (!response.ok) throw new Error(`Groq API returned status: ${response.status}`);
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("🔴 Groq Inference Error:", error);
        return "System Warning: Neural link to Groq LPUs severed. Please check the network or API keys.";
    }
};