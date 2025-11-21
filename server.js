import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

// 1. Check API Key immediately
if (!process.env.GEMINI_API_KEY) {
    console.error("CRITICAL ERROR: GEMINI_API_KEY is missing in Environment Variables!");
    process.exit(1);
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get("/", (req, res) => {
    res.send("Netbhet Gemini Relay is Running.");
});

wss.on("connection", (clientWs, req) => {
    console.log("--> New Client Connected");

    const params = new URLSearchParams(req.url.replace('/?', ''));
    const userName = params.get('name') || "Student";
    const voiceName = params.get('voice') || "Kore"; 
    const style = params.get('style') || "Casual";

    // 2. Define Google Connection
    const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
    
    let googleWs = null;

    try {
        googleWs = new WebSocket(GEMINI_URL);
    } catch (err) {
        console.error("Failed to create Google WebSocket:", err);
        clientWs.close(1011, "Server failed to contact Google.");
        return;
    }

    // 3. Define Training Instructions
    const isMaleVoice = ['Charon', 'Fenrir', 'Puck'].includes(voiceName);
    const botName = isMaleVoice ? "Rahul" : "Riya";
    
    const systemInstruction = `
    You are ${botName}, an expert English language coach.
    User: ${userName}. Level: Intermediate. Style: ${style}.
    
    RULES:
    1. Greet immediately: "Namaskar ${userName}! I am ${botName}. Shall we start practice?"
    2. Speak mostly English (90%). Explain grammar in Marathi (10%).
    3. Keep responses concise.
    4. No politics or adult topics.
    `;

    // 4. Handle Google Events
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

    googleWs.on("error", (err) => {
        console.error("xx Google WebSocket Error:", err.message);
        // Send meaningful error to client
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, "Google API Error. Check Server Logs.");
        }
    });

    googleWs.on("close", (code, reason) => {
        console.log(`xx Google Disconnected: ${code} ${reason}`);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1000, "Google session ended.");
        }
    });

    // 5. Relay Messages
    clientWs.on("message", (data) => {
        if (googleWs.readyState === WebSocket.OPEN) {
            googleWs.send(data);
        }
    });

    googleWs.on("message", (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
        }
    });

    // Cleanup
    clientWs.on("close", () => {
        console.log("Client Disconnected");
        if (googleWs.readyState === WebSocket.OPEN) googleWs.close();
    });
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
