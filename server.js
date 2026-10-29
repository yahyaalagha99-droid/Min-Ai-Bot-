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

// ===== الإعدادات =====
const VISION_MODEL = "qwen/qwen3.8-27b";

// --- دالة مساعدة لجلب أسعار الأسواق الحية (الذهب والعملات الرقمية) ---
async function fetchLiveMarketData(query) {
  const q = query.toLowerCase();
  try {
    // جلب سعر الذهب والمعادن أو العملات إذا طلب المستخدم ذلك
    if (q.includes("ذهب") || q.includes("gold") || q.includes("سعر الذهب")) {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd"); // مثال أو مصدر بديل
      // سنستخدم مصدر عام مجاني وموثوق لأسعار المعادن الثمينة أو العملات الرقمية
      const goldRes = await fetch("https://data-asg.goldprice.org/dbXRates/USD");
      if (goldRes.ok) {
        const data = await goldRes.json();
        const xauPrice = data.items?.[0]?.xauPrice;
        if (xauPrice) {
          return `📊 **السعر الفوري للذهب حالياً:**\n• أونصة الذهب: $${xauPrice.toFixed(2)} USD\n*(محدث لحظياً من الأسواق العالمية)*`;
        }
      }
    }
    
    // جلب أسعار العملات الرقمية الشهيرة فورياً
    if (q.includes("bitcoin") || q.includes("btc") || q.includes("بتكوين") || q.includes("العملات الرقمية")) {
      const cryptoRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd");
      if (cryptoRes.ok) {
        const cData = await cryptoRes.json();
        return `🪙 **الأسعار الفورية للعملات الرقمية:**\n` +
               `• Bitcoin (BTC): $${cData.bitcoin?.usd || "N/A"}\n` +
               `• Ethereum (ETH): $${cData.ethereum?.usd || "N/A"}\n` +
               `• Solana (SOL): $${cData.solana?.usd || "N/A"}\n` +
               `*(محدث لحظياً)*`;
    }
  } catch (e) {
    console.error("Live Market Fetch Error:", e.message);
  }
  return null;
}

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

// مسار الـ Streaming المعالج للنصوص والصور (الواجهة)
app.post('/ask/stream', upload.single('image'), async (req, res) => {
  try {
    let messages = parseMessages(req.body.messages);

    if (!messages) {
      messages = [{ role: 'user', content: "مرحباً" }];
    }

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

    for (let i = 0; i < messages.length - 1; i++) {
      if (messageHasImage(messages[i])) {
        messages[i].content = messages[i].content.filter(c => c.type !== 'image_url');
        if (!messages[i].content.some(c => c.type === 'text')) {
          messages[i].content.push({ type: "text", text: "[صورة سابقة]" });
        }
      }
    }

    const lastUserText = messages[messages.length - 1]?.content;
    const textToCheck = typeof lastUserText === 'string' ? lastUserText : (Array.isArray(lastUserText) ? lastUserText.find(c => c.type === 'text')?.text : "");
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // التحقق إذا كان الطلب يسأل عن أسعار حية
    if (textToCheck) {
      const liveData = await fetchLiveMarketData(textToCheck);
      if (liveData) {
        res.write(`data: ${JSON.stringify({ token: liveData })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
    }

    const hasImage = messages.some(messageHasImage);
    const activeModel = hasImage ? VISION_MODEL : GROQ_MODEL;

    const formattedMessages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      ...messages
    ];

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

// ============================================================
// بلوك مسارات API للبوتات
// ============================================================

// نص ← رد
app.post('/api/text', async (req, res) => {
  try {
    const text = (req.body && req.body.text) || "";
    if (!text.trim()) return res.status(400).json({ error: "لا يوجد نص" });

    // فحص إذا كان السؤال عن الذهب أو العملات لجلب السعر الفوري المباشر
    const liveData = await fetchLiveMarketData(text);
    if (liveData) {
      return res.json({ reply: liveData });
    }

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

    const fileName = (req.file.originalname && req.file.originalname.includes("."))
      ? req.file.originalname
      : "voice.ogg";

    const transcription = await groq.audio.transcriptions.create({
      file: new File([req.file.buffer], fileName, { type: req.file.mimetype }),
      model: "whisper-large-v3",
    });

    const userText = transcription.text || "";

    // فحص الصوت إن كان يسأل عن الذهب أو العملات لجلب السعر الفوري
    const liveData = await fetchLiveMarketData(userText);
    if (liveData) {
      return res.json({ text: liveData });
    }

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: userText }
      ],
      model: GROQ_MODEL,
    });

    res.json({ text: completion.choices[0]?.message?.content || "..." });
  } catch (error) {
    console.error("API /api/audio Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// نهاية بلوك مسارات البوتات
// ============================================================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);
});

// تشغيل بوت تيليجرام من نفس العملية
if (process.env.TELEGRAM_BOT_TOKEN) {
  import("./telegram.js").catch(err => console.error("Telegram bot failed:", err.message));
}
