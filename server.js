import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

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
    
    // 1. Start Timer for Server Logs
    const startTime = Date.now();

    const params = new URLSearchParams(req.url.replace('/?', ''));
    const userName = params.get('name') || "Student";
    const voiceName = params.get('voice') || "Kore"; 
    const style = params.get('style') || "Casual";

    const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
    
    let googleWs = null;
    try {
        googleWs = new WebSocket(GEMINI_URL);
    } catch (e) {
        clientWs.close(1011, "Server Config Error");
        return;
    }

    const isMaleVoice = ['Charon', 'Fenrir', 'Puck', 'Zephyr'].includes(voiceName);
    const botName = isMaleVoice ? "Rahul" : "Riya";
    
    const systemInstructionText = `
    You are ${botName}, an expert English language coach.
    User: ${userName}. Level: Intermediate. Style: ${style}.
    
    RULES:
    1. Greet immediately: "Namaskar ${userName}! I am ${botName}. Shall we start?"
    2. Speak mostly English (90%). Explain grammar in Marathi (10%).
    3. Keep responses concise (2-3 sentences).
    4. NOISE HANDLING: If you hear silence/static, do NOT respond.
    `;

    googleWs.on("open", () => {
        const setupMessage = {
            setup: {
                model: "models/gemini-2.0-flash-exp", 
                generation_config: {
                    response_modalities: ["AUDIO"], // Audio-only prevents Error 1007
                    speech_config: {
                        voice_config: { prebuilt_voice_config: { voice_name: voiceName } }
                    }
                },
                system_instruction: {
                    parts: [{ text: systemInstructionText }]
                }
            }
        };
        googleWs.send(JSON.stringify(setupMessage));
    });

    googleWs.on("error", (err) => console.error("Google Error:", err.message));
    
    googleWs.on("close", (code, reason) => {
        console.log(`Google Closed: ${code} ${reason}`);
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    // 2. Relay Logic
    clientWs.on("message", (data) => {
        if (googleWs.readyState === WebSocket.OPEN) googleWs.send(data);
    });

    googleWs.on("message", (data) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
    });

    clientWs.on("close", () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`Session ended. Duration: ${duration}s`);
        if (googleWs.readyState === WebSocket.OPEN) googleWs.close();
    });
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
