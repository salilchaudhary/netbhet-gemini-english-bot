import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

// Create HTTP server (required for Render)
const server = http.createServer(app);

// Create WebSocket Server on top of HTTP
const wss = new WebSocketServer({ server });

app.get("/", (req, res) => {
res.send("Netbhet Gemini Relay is Running");
});

// Handle Client Connection
wss.on("connection", (clientWs, req) => {
console.log("New Client Connected");

// 1. Parse Inputs from URL
// Example: wss://your-url.com/?name=Rahul&voice=Kore&style=Strict
const params = new URLSearchParams(req.url.replace('/?', ''));
const name = params.get('name') || "Student";
const voiceName = params.get('voice') || "Kore";
const style = params.get('style') || "Casual";

// 2. Connect to Google Gemini
// WE ARE USING GEMINI 2.0 FLASH EXP (Required for Live API)
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;

const googleWs = new WebSocket(GEMINI_URL);

// 3. Define Persona & Rules
const systemInstruction = `
You are an English Coach named ${['Charon', 'Fenrir', 'Puck'].includes(voiceName) ? 'Rahul' : 'Riya'}.
User Name: ${name}. Style: ${style}.

RULES:
1. Greet immediately: "Namaskar ${name}! I am your AI coach. Shall we start?"
2. Explain briefly in MARATHI to speak clearly.
3. Speak mostly English. Explain grammar mistakes in MARATHI.
4. SAFETY: No politics, religion, profanity, or adult topics. Redirect politely.
5. NOISE: If audio is just static/breathing, stay silent. Do not hallucinate words.
`;

// 4. When Google Connects -> Send Setup
googleWs.on("open", () => {
console.log("Connected to Google");
const setupMessage = {
setup: {
model: "models/gemini-2.0-flash-exp",
generationConfig: {
responseModalities: ["AUDIO"],
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

// 5. Client (Mic) -> Google
clientWs.on("message", (data) => {
if (googleWs.readyState === WebSocket.OPEN) {
googleWs.send(data);
}
});

// 6. Google (Audio) -> Client (Speaker)
googleWs.on("message", (data) => {
if (clientWs.readyState === WebSocket.OPEN) {
clientWs.send(data);
}
});

// Cleanup
clientWs.on("close", () => googleWs.close());
googleWs.on("close", () => clientWs.close());
googleWs.on("error", (err) => console.error("Google WS Error:", err));
});

server.listen(port, () => {
console.log(`Server listening on port ${port}`);
});