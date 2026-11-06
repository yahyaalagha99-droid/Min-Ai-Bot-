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
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const JAVIS_REALTIME_SYSTEM = `
You are Javis, an elite, hyper-realistic AI trading assistant. 
You talk with extreme confidence, speed, and precision in German, English, Arabic, or Kurdish.
When given trading capital (e.g., 10,000 EUR), you immediately simulate/execute market analysis, momentum, volatility tracking, strategy matching, compute profits dynamically, and confirm payouts.
`;

// مسار الصفحة الرئيسية لحل المشكلة فوراً
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <title>Javis Trading Assistant</title>
          <style>
              body { background: #0f172a; color: #fff; font-family: sans-serif; text-align: center; padding-top: 50px; }
              button { background: #3b82f6; color: white; border: none; padding: 15px 30px; font-size: 18px; border-radius: 8px; cursor: pointer; margin-top: 20px; }
          </style>
      </head>
      <body>
          <h1>مرحباً بك في نظام Javis للتداول الذكي</h1>
          <p>السيرفر يعمل بنجاح تام وجاهز لاستقبال الأوامر.</p>
          <button onclick="startTrading()">بدء التداول (10,000 يورو)</button>
          <div id="output" style="margin-top: 30px; font-size: 20px; color: #10b981;"></div>

          <script>
              async function startTrading() {
                  document.getElementById('output').innerText = "جاري الاتصال بالنظام وتحليل السوق...";
                  const res = await fetch('/api/javis-chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ prompt: "ابدأ التداول برأس مال 10000 يورو" })
                  });
                  if(res.ok) {
                      const blob = await res.blob();
                      const audioUrl = URL.createObjectURL(blob);
                      const audio = new Audio(audioUrl);
                      audio.play();
                      document.getElementById('output').innerText = "تم تنفيذ التحليل الصوتي بنجاح!";
                  } else {
                      document.getElementById('output').innerText = "حدث خطأ في الاتصال.";
                  }
              }
          </script>
      </body>
      </html>
    `);
  }
});

app.post('/api/javis-chat', async (req, res) => {
  try {
    const { prompt, amount } = req.body;
    const userPrompt = prompt || `ابدأ التداول برأس مال ${amount || 10000} يورو`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: JAVIS_REALTIME_SYSTEM },
        { role: 'user', content: userPrompt }
      ],
      model: "llama-3.3-70b-versatile",
    });

    const replyText = completion.choices[0]?.message?.content || "System active. Ready.";

    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx",
      input: replyText,
    });

    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
    
    res.set({
      "Content-Type": "audio/mpeg",
      "X-Text-Response": encodeURIComponent(replyText),
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
