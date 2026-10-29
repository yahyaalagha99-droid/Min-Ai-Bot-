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

const VISION_MODEL = "qwen/qwen3.8-27b";

// --- دالة الصرامة السعرية الفورية (تعطيك الرقم مباشرة بالثانية بدون شرح) ---
async function fetchLiveMarketData(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  
  try {
    // 1. فحص الذهب
    if (q.includes("ذهب") || q.includes("gold") || q.includes("سعر الذهب")) {
      const goldRes = await fetch("https://data-asg.goldprice.org/dbXRates/USD");
      if (goldRes.ok) {
        const data = await goldRes.json();
        const xauPrice = data.items?.[0]?.xauPrice;
        if (xauPrice) {
          return `$${xauPrice.toFixed(2)} USD`; // يعطي الرقم فوراً وبكل صرامة
        }
      }
      const paxgRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd");
      if (paxgRes.ok) {
        const pData = await paxgRes.json();
        const price = pData["pax-gold"]?.usd;
        if (price) {
          return `$${price} USD`;
        }
      }
    }

    // 2. فحص العملات الرقمية بدقة فائقة وبالثانية
    if (q.includes("بتكوين") || q.includes("bitcoin") || q.includes("btc") || q.includes("ايثريوم") || q.includes("ethereum") || q.includes("eth") || q.includes("سعر") || q.includes("عملة")) {
      const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.coins && searchData.coins.length > 0) {
          const coinId = searchData.coins[0].id;
          const coinSymbol = searchData.coins[0].symbol.toUpperCase();

          const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`);
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const coinInfo = priceData[coinId];
            if (coinInfo) {
              const usdPrice = coinInfo.usd;
              const change24 = coinInfo.usd_24h_change ? coinInfo.usd_24h_change.toFixed(2) : "0.00";
              return `${coinSymbol}: $${usdPrice} USD (التغير 24س: ${change24}%)`; // رقم مباشر ودقيق بدون حشو
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Live Market Error:", e.message);
  }
  return null;
}

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

    const stream = await groq.chat.completions.create({
      messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, ...messages],
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

// المسار الأساسي لبوت تيليجرام (اعتراض الأسعار وإعطاء الرقم حصراً)
app.post('/api/text', async (req, res) => {
  try {
    const text = (req.body && req.body.text) || "";
    if (!text.trim()) return res.status(400).json({ error: "لا يوجد نص" });

    // اعتراض الطلب وجلب السعر فوراً بدقة تامة وبدون شرح
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

app.post('/api/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "لا توجد صورة" });
    const prompt = req.body.prompt || "صف لي الصورة";
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, { role: 'user', content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }],
      model: VISION_MODEL,
    });
    res.json({ reply: completion.choices[0]?.message?.content || "..." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "لا يوجد صوت" });
    const fileName = req.file.originalname || "voice.ogg";
    const transcription = await groq.audio.transcriptions.create({
      file: new File([req.file.buffer], fileName, { type: req.file.mimetype }),
      model: "whisper-large-v3",
    });
    const userText = transcription.text || "";
    const liveData = await fetchLiveMarketData(userText);
    if (liveData) return res.json({ text: liveData });

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, { role: 'user', content: userText }],
      model: GROQ_MODEL,
    });
    res.json({ text: completion.choices[0]?.message?.content || "..." });
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
