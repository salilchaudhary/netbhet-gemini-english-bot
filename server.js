import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

// 1. Validate API Key Format
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("CRITICAL ERROR: GEMINI_API_KEY is missing in Environment Variables!");
    process.exit(1);
}
// Log key status (masked) for debugging
console.log(`Server starting with API Key: ${API_KEY.substring(0, 8)}... (Length: ${API_KEY.length})`);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get("/", (req, res) => {
    res.send("Netbhet Gemini Relay is Running.");
});

wss.on("connection", (clientWs, req) => {
    console.log("--> Client Connected");

    const params = new URLSearchParams(req.url.replace('/?', ''));
    const userName = params.get('name') || "Student";
    const voiceName = params.get('voice') || "Kore"; 
    const style = params.get('style') || "Casual";

    // 2. Google Connection
    const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
    
    let googleWs = null;
    try {
        googleWs = new WebSocket(GEMINI_URL);
    } catch (e) {
        console.error("Socket Config Error:", e);
        clientWs.close(1011, "Server Configuration Error");
        return;
    }

    // 3. Define Persona
    const isMaleVoice = ['Charon', 'Fenrir', 'Puck'].includes(voiceName);
    const botName = isMaleVoice ? "Rahul" : "Riya";
    
    const systemInstruction = `
    You are ${botName}, an expert English language coach.
    User: ${userName}. Level: Intermediate. Style: ${style}.
    RULES:
    1. Greet immediately: "Namaskar ${userName}! I am ${botName}. Shall we start?"
    2. Speak mostly English (90%). Explain grammar in Marathi (10%).
    3. Keep responses concise (2-3 sentences).
    4. NOISE HANDLING: If you hear only silence or static, output NOTHING. Do not say "Thank you".
    `;

    googleWs.on("open", () => {
        console.log("--> Connected to Google Gemini");
        
        const setupMessage = {
            setup: {
                model: "models/gemini-2.0-flash-exp", 
                generationConfig: {
                    responseModalities: ["AUDIO", "TEXT"],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } }
                    }
                },
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                }
            }
        };
        googleWs.send(JSON.stringify(setupMessage));
    });

    // 4. Enhanced Error Logging
    googleWs.on("error", (err) => {
        console.error("!! Google WebSocket Error:", err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, `Google Error: ${err.message}`);
        }
    });

    googleWs.on("close", (code, reason) => {
        // Decode buffer reason if necessary, but usually it's text
        const reasonText = reason.toString();
        console.log(`!! Google Disconnected. Code: ${code}, Reason: ${reasonText}`);
        
        if (clientWs.readyState === WebSocket.OPEN) {
            // Send the specific reason to the frontend
            if (reasonText.includes("API_KEY")) {
                clientWs.close(1008, "Invalid API Key.");
            } else if (code === 1000) {
                clientWs.close(1000, "Session ended normally.");
            } else {
                clientWs.close(1011, `Google Closed Session (Code ${code}). Check Logs.`);
            }
        }
    });

    // 5. Relay Logic
    clientWs.on("message", (data) => {
        if (googleWs.readyState === WebSocket.OPEN) googleWs.send(data);
    });

    googleWs.on("message", (data) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
    });

    clientWs.on("close", () => {
        if (googleWs.readyState === WebSocket.OPEN) googleWs.close();
    });
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
