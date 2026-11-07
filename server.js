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
You are JARVIS, an elite, hyper-realistic AI trading assistant. 
You talk with extreme confidence, speed, and precision in German, English, Arabic, or Kurdish.
Analyze market momentum, volatility, execute trading strategies, and compute profits dynamically according to the user's specific commands.
`;

// قراءة ملف الواجهة index.html وإرساله للمتصفح
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).send('ملف index.html غير موجود في المجلد الرئيسي!');
  }
});

app.post('/api/javis-chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    const userPrompt = prompt || "ابدأ التداول";

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
    const base64Audio = audioBuffer.toString("base64");

    res.json({
      reply: replyText,
      audio: base64Audio
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`JARVIS Server running on port ${PORT}`);
});
