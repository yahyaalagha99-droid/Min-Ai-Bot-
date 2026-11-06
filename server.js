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

// نظام توجيه Javis الصارم والمطابق للفيديو تماماً
const JAVIS_REALTIME_SYSTEM = `
You are Javis, an elite, hyper-realistic AI trading assistant. 
You talk with extreme confidence, speed, and precision in German, English, Arabic, or Kurdish.
When given trading capital (e.g., 10,000 EUR), you immediately simulate/execute market analysis, momentum, volatility tracking, strategy matching, compute profits dynamically (e.g., reaching 15,327 EUR), and confirm payouts (e.g., to Revolut).
Keep responses sharp, professional, and ultra-fast, exactly like an advanced trading assistant.
`;

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

    // توليد الصوت الواقعي الفوري عبر OpenAI TTS
    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx", // نبرة صوت عميقة وسريعة تناسب Javis
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
  console.log(`Javis Realtime Server running on port ${PORT}`);
});
