import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import { SYSTEM_INSTRUCTION, BOT_NAME, DEVELOPER_NAME, GROQ_MODEL } from "./config.js";

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

// ===== الإعدادات الجديدة =====
// llama-3.2-90b-vision-preview و llama-4-scout أوقفهما رسمياً من Groq
// نموذج الرؤية الحالي المتاح رسمياً على Groq: qwen/qwen3.8-27b
const VISION_MODEL = "qwen/qwen3.8-27b";

// فحص هل الرسالة تحتوي صورة
function messageHasImage(msg) {
  return msg && Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url');
}

// تحويل بافر الصورة المرفوعة إلى Data URL بصيغة base64
function bufferToImageUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

// تحليل messages بأمان (قد تصل كنص نصي عند الإرسال عبر FormData)
function parseMessages(raw) {
  if (!raw) return null;
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
  }
  return Array.isArray(parsed) && parsed.length ? parsed : null;
}

// الصفحة الرئيسية لتشغيل واجهة الموقع
app.get('/', (req, res) => {
  const possiblePaths = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'Frontend', 'index.html')
  ];
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  res.status(404).send('ملف الواجهة غير موجود!');
});

// مسار الـ Streaming المعالج للنصوص والصور
// التغيير: upload.single('image') اختياري — يقبل JSON العادي كما هو، ويقبل أيضاً صورة مرفوعة باسم image
app.post('/ask/stream', upload.single('image'), async (req, res) => {
  try {
    let messages = parseMessages(req.body.messages);

    if (!messages) {
      messages = [{ role: 'user', content: "مرحباً" }];
    }

    // إذا وصلت صورة مرفوعة (multipart/form-data) نضيفها لآخر رسالة كـ image_url
    if (req.file) {
      const lastMsg = messages[messages.length - 1];
      const textPart =
        (typeof lastMsg?.content === "string" && lastMsg.content.trim()) ||
        req.body.prompt || req.body.text || "صف لي ما في هذه الصورة";

      lastMsg.content = [
        { type: "text", text: textPart },
        { type: "image_url", image_url: { url: bufferToImageUrl(req.file) } }
      ];
    }

    // إزالة الصور من الرسائل القديمة (نُبقي صورة آخر رسالة فقط)
    // لتجنب تجاوز الحد الأقصى للصور وتقليل حجم الطلب
    for (let i = 0; i < messages.length - 1; i++) {
      if (messageHasImage(messages[i])) {
        messages[i].content = messages[i].content.filter(c => c.type !== 'image_url');
        if (!messages[i].content.some(c => c.type === 'text')) {
          messages[i].content.push({ type: "text", text: "[صورة سابقة]" });
        }
      }
    }

    // اختيار النموذج: نموذج الرؤية إذا الطلب يحتوي صورة، وإلا نموذج النصوص الأساسي
    const hasImage = messages.some(messageHasImage);
    const activeModel = hasImage ? VISION_MODEL : GROQ_MODEL;

    const formattedMessages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      ...messages
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await groq.chat.completions.create({
      messages: formattedMessages,
      model: activeModel,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error) {
    console.error("Stream API Error:", error);
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ error: error.message || "حدث خطأ في معالجة الطلب" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);
});
// ============================================================
// بلوك مسارات API للبوتات
// ============================================================

// نص ← رد
app.post('/api/text', async (req, res) => {
  try {
    const text = (req.body && req.body.text) || "";
    if (!text.trim()) return res.status(400).json({ error: "لا يوجد نص" });

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: text }
      ],
      model: GROQ_MODEL,
    });

    res.json({ reply: completion.choices[0]?.message?.content || "..." });
  } catch (error) {
    console.error("API /api/text Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// صورة + نص اختياري ← رد
app.post('/api/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "لا توجد صورة" });

    const prompt = req.body.prompt || "صف لي ما في هذه الصورة";
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        {
          role: 'user',
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      model: VISION_MODEL,
    });

    res.json({ reply: completion.choices[0]?.message?.content || "..." });
  } catch (error) {
    console.error("API /api/image Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// صوت ← تحويل إلى نص ثم رد
app.post('/api/audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "لا يوجد صوت" });

    // Groq يتطلب اسم ملف بامتداد صحيح
    const fileName = (req.file.originalname && req.file.originalname.includes("."))
      ? req.file.originalname
      : "voice.ogg";

    const transcription = await groq.audio.transcriptions.create({
      file: new File([req.file.buffer], fileName, { type: req.file.mimetype }),
      model: "whisper-large-v3",
    });

    const userText = transcription.text || "";

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: userText }
      ],
      model: GROQ_MODEL,
    });

    // ⚠️ البوت يقرأ المفتاح text لمسار الصوت — لا تغيره إلى reply
    res.json({ text: completion.choices[0]?.message?.content || "..." });
  } catch (error) {
    console.error("API /api/audio Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// نهاية بلوك مسارات البوتات
// ============================================================
