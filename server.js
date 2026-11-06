import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 }, storage: multer.memoryStorage() });

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(__dirname));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const JAVIS_REALTIME_SYSTEM = `
You are Javis, an elite, hyper-realistic AI trading assistant. 
You talk with extreme confidence, speed, and precision in German, English, Arabic, or Kurdish.
When given trading capital (e.g., 10,000 EUR), you immediately simulate/execute market analysis, momentum, volatility tracking, strategy matching, and compute profits dynamically.
`;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>JARVIS - AI Trading Assistant</title>
        <style>
            body {
                background-color: #05050a;
                color: #ffffff;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                overflow: hidden;
            }
            h1 {
                letter-spacing: 3px;
                margin-bottom: 5px;
                font-weight: 300;
                color: #94a3b8;
            }
            .orb-container {
                position: relative;
                width: 220px;
                height: 220px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 30px 0;
            }
            .orb {
                width: 150px;
                height: 150px;
                background: radial-gradient(circle, #ff1a1a 0%, #990000 60%, #330000 100%);
                border-radius: 50%;
                box-shadow: 0 0 50px #ff0000, 0 0 100px #ff1a1a;
                animation: pulse 2s infinite ease-in-out;
            }
            .orb.active {
                animation: speak 0.6s infinite alternate ease-in-out;
            }
            @keyframes pulse {
                0% { transform: scale(0.95); box-shadow: 0 0 30px #ff0000; }
                50% { transform: scale(1.05); box-shadow: 0 0 70px #ff3333; }
                100% { transform: scale(0.95); box-shadow: 0 0 30px #ff0000; }
            }
            @keyframes speak {
                0% { transform: scale(0.9); box-shadow: 0 0 40px #ff0000; }
                100% { transform: scale(1.2); box-shadow: 0 0 90px #ff6666; }
            }
            .btn {
                background: linear-gradient(135deg, #1e293b, #0f172a);
                color: #e2e8f0;
                border: 1px solid #334155;
                padding: 14px 28px;
                font-size: 16px;
                border-radius: 30px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            }
            .btn:hover {
                border-color: #ff1a1a;
                box-shadow: 0 0 15px rgba(255,26,26,0.4);
            }
            #status {
                margin-top: 20px;
                font-size: 15px;
                color: #38bdf8;
                height: 30px;
            }
        </style>
    </head>
    <body>
        <h1>JARVIS</h1>
        <div class="orb-container">
            <div class="orb" id="orb"></div>
        </div>
        <button class="btn" onclick="startJavis()">بدء التداول (10,000 يورو)</button>
        <div id="status">النظام جاهز للاستماع والتحليل</div>

        <script>
            async function startJavis() {
                const orb = document.getElementById('orb');
                const status = document.getElementById('status');
                
                status.innerText = "جاري تحليل السوق وتنفيذ الصفقات...";
                orb.classList.add('active');

                try {
                    const response = await fetch('/api/javis-chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: "ابدأ التداول برأس مال 10000 يورو" })
                    });

                    if (!response.ok) throw new Error("فشل الاتصال بالسيرفر");

                    const blob = await response.blob();
                    const audioUrl = URL.createObjectURL(blob);
                    const audio = new Audio(audioUrl);
                    
                    audio.play();
                    status.innerText = "Jarvis يتحدث الآن...";

                    audio.onended = () => {
                        orb.classList.remove('active');
                        status.innerText = "اكتملت العملية بنجاح.";
                    };
                } catch (err) {
                    status.innerText = "حدث خطأ: " + err.message;
                    orb.classList.remove('active');
                }
            }
        </script>
    </body>
    </html>
  `);
});

app.post('/api/javis-chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    const userPrompt = prompt || "ابدأ التداول برأس مال 10000 يورو";

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: JAVIS_REALTIME_SYSTEM },
        { role: 'user', content: userPrompt }
      ],
      model: "llama-3.3-70b-versatile",
    });

    const replyText = completion.choices[0]?.message?.content || "System active.";

    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx",
      input: replyText,
    });

    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
    
    res.set({
      "Content-Type": "audio/mpeg",
    });
    res.send(audioBuffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Javis Server running on port ${PORT}`);
});
