import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

// CRITICAL: Ensure API Key is present
if (!process.env.GEMINI_API_KEY) {
    console.error("CRITICAL ERROR: GEMINI_API_KEY is missing!");
    process.exit(1);
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get("/", (req, res) => {
    res.send("Netbhet Gemini Relay is Running.");
});

wss.on("connection", (clientWs, req) => {
    console.log("--> Client Connected");

    // 1. Parse Inputs (Name, Style, Voice)
    const params = new URLSearchParams(req.url.replace('/?', ''));
    const userName = params.get('name') || "Student";
    const voiceName = params.get('voice') || "Kore"; 
    const style = params.get('style') || "Casual";

    // ========================================================================
    //  CUSTOMIZATION SECTION - EDIT THIS TO "TRAIN" YOUR BOT
    // ========================================================================
    
    // 1. SET BOT NAME
    // Logic: If voice is male-sounding, name is Rahul. Otherwise, Riya.
    const isMaleVoice = ['Charon', 'Fenrir', 'Puck'].includes(voiceName);
    const botName = isMaleVoice ? "Rahul" : "Riya";

    // 2. SET GREETING
    // This is the first thing the AI says.
    const initialGreeting = `Namaskar ${userName}! I am ${botName}, your English coach. Shall we start practice?`;

    // 3. TRAINING PROMPT (The "Brain")
    const trainingPrompt = `
    You are ${botName}, an expert English language coach.
    User: ${userName}. Level: Intermediate. Style: ${style}.

    YOUR RULES:
    1. **Mix Languages:** Speak 90% English. Use MARATHI only to explain grammar mistakes or difficult concepts.
    2. **Correction:** Correct mistakes gently. Don't interrupt flow for minor errors.
    3. **Topics:** Ask about their day, hobbies, or food. Keep the chat moving.
    4. **Safety:** No politics, religion, or adult topics.
    5. **Greeting:** Start with: "${initialGreeting}"
    `;
    // ========================================================================

    // 4. Connect to Google Gemini (Flash 2.0)
    const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
    const googleWs = new WebSocket(GEMINI_URL);

    googleWs.on("open", () => {
        console.log("--> Connected to Google");
        const setupMessage = {
            setup: {
                model: "models/gemini-2.0-flash-exp", 
                generationConfig: {
                    responseModalities: ["AUDIO", "TEXT"], // Audio for hearing, Text for Pabbly
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } }
                    }
                },
                systemInstruction: {
                    parts: [{ text: trainingPrompt }]
                }
            }
        };
        googleWs.send(JSON.stringify(setupMessage));
    });

    // 5. Relay Logic (Client <-> Google)
    clientWs.on("message", (data) => {
        if (googleWs.readyState === WebSocket.OPEN) googleWs.send(data);
    });

    googleWs.on("message", (data) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
    });

    clientWs.on("close", () => googleWs.close());
    googleWs.on("close", () => clientWs.close());
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
