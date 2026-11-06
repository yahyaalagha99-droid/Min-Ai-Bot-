import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import OpenAI from "openai";
import { SYSTEM_INSTRUCTION, BOT_NAME, GROQ_MODEL } from "./config.js";
import { handleMarketQuery } from "./features.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 }, storage: multer.memoryStorage() });

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'Frontend')));
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VISION_MODEL = "qwen/qwen3.8-27b";

function messageHasImage(msg) {
  return msg && Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url');
}

function bufferToImageUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

function parseMessages(raw) {
  if (!raw) return null;
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
  }
  return Array.isArray(parsed) && parsed.length ? parsed : null;
}

app.get('/', (req, res) => {
  const possiblePaths = [path.join(__dirname, 'index.html'), path.join(__dirname, 'Frontend', 'index.html')];
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
  }
  res.status(404).send('ملف الواجهة غير موجود!');
});

app.post('/ask/stream', upload.single('image'), async (req, res) => {
  try {
    let messages = parseMessages(req.body.messages);
    if (!messages) messages = [{ role: 'user', content: "مرحباً" }];

    if (req.file) {
      const lastMsg = messages[messages.length - 1];
      const textPart = (typeof lastMsg?.content === "string" && lastMsg.content.trim()) || req.body.prompt || req.body.text || "صف لي الصورة";
      lastMsg.content = [{ type: "text", text: textPart }, { type: "image_url", image_url: { url: bufferToImageUrl(req.file) } }];
    }

    const lastUserText = messages[messages.length - 1]?.content;
    const textToCheck = typeof lastUserText === 'string' ? lastUserText : (Array.isArray(lastUserText) ? lastUserText.find(c => c.type === 'text')?.text : "");
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (textToCheck) {
      const liveData = await handleMarketQuery(textToCheck);
      if (liveData) {
        res.write(`data: ${JSON.stringify({ token: liveData })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
    }

    const hasImage = messages.some(messageHasImage);
    const activeModel = hasImage ? VISION_MODEL : GROQ_MODEL;

    const multilingualSystemInstruction = `${SYSTEM_INSTRUCTION} - Speak fluently and respond precisely in the language or dialect used by the user (Kurdish, Arabic, German, English).`;

    const stream = await groq.chat.completions.create({
      messages: [{ role: 'system', content: multilingualSystemInstruction }, ...messages],
      model: activeModel,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "لا يوجد نص لتحويله لصوت" });

    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });

    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length,
    });
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "لا يوجد صوت" });
    const fileName = req.file.originalname || "voice.webm";
    
    const transcription = await groq.audio.transcriptions.create({
      file: new File([req.file.buffer], fileName, { type: req.file.mimetype }),
      model: "whisper-large-v3",
    });
    const userText = transcription.text || "";
    
    const liveData = await handleMarketQuery(userText);
    let replyText = liveData;

    if (!replyText) {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: `${SYSTEM_INSTRUCTION} - Understand the user's language (Kurdish, Arabic, German, English) and reply in the same language.` },
          { role: 'user', content: userText }
        ],
        model: GROQ_MODEL,
      });
      replyText = completion.choices[0]?.message?.content || "...";
    }

    res.json({ text: replyText });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);
});

if (process.env.TELEGRAM_BOT_TOKEN) {
  import("./telegram.js").catch(err => console.error("Telegram bot failed:", err.message));
}
