// server.js - السيرفر الداعم لموقع الويب وتيليجرام معاً
const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');
const { SYSTEM_INSTRUCTION, BOT_NAME, DEVELOPER_NAME, GROQ_MODEL } = require('./config');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'Frontend')));
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ذاكرة مؤقتة لموقع الويب
let conversationHistory = [
  { role: 'system', content: SYSTEM_INSTRUCTION }
];

app.get('/', (req, res) => {
  const possiblePaths = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'Frontend', 'index.html')
  ];
  for (const filePath of possiblePaths) {
    if (require('fs').existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  res.status(404).send('ملف الواجهة غير موجود!');
});

// API موقع الويب
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let prompt = req.body.prompt || "";
    const clientTime = req.body.clientTime || new Date().toLocaleString();
    const clientTimeZone = req.body.clientTimeZone || "Unknown";

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        prompt += `\n[ملاحظة: قام المستخدم برفع صورة باسم (${req.file.originalname})]`;
      } else {
        const fileContent = req.file.buffer.toString('utf8');
        const trimmedContent = fileContent.length > 2000 ? fileContent.substring(0, 2000) + "\n[تم اقتصاص باقي الملف...]" : fileContent;
        prompt += `\n[محتوى الملف المرفق (${req.file.originalname}):\n${trimmedContent}\n]`;
      }
    }

    const timeContext = `[Context -> Local Time: ${clientTime}, TimeZone: ${clientTimeZone}, Year: 2026]`;
    const fullUserMessage = `${timeContext}\n${prompt}`;

    conversationHistory.push({ role: 'user', content: fullUserMessage });

    if (conversationHistory.length > 8) {
      const systemPrompt = conversationHistory[0];
      conversationHistory = [systemPrompt, ...conversationHistory.slice(-6)];
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: conversationHistory,
      model: GROQ_MODEL,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "لم يتم استلام رد.";
    conversationHistory.push({ role: 'assistant', content: reply });

    res.json({ success: true, bot: BOT_NAME, creator: DEVELOPER_NAME, reply: reply });

  } catch (error) {
    console.error("Server Error:", error);
    conversationHistory = [{ role: 'system', content: SYSTEM_INSTRUCTION }];
    res.status(500).json({ success: false, error: "تم إعادة ضبط الذاكرة مؤقتاً. حاول مجدداً." });
  }
});

// ----------------------------------------------------
// نظام الاستماع لرسائل تيليجرام تلقائياً (Telegram Bot Polling)
// ----------------------------------------------------
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
if (telegramToken) {
  let offset = 0;
  setInterval(async () => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates?offset=${offset}&timeout=30`);
      const data = await res.json();
      
      if (data.ok && data.result) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (update.message && update.message.text) {
            const chatId = update.message.chat.id;
            const userText = update.message.text;

            // إرسال الرسالة إلى نموذج الذكاء الاصطناعي
            const chatCompletion = await groq.chat.completions.create({
              messages: [
                { role: 'system', content: SYSTEM_INSTRUCTION },
                { role: 'user', content: userText }
              ],
              model: GROQ_MODEL,
            });

            const replyText = chatCompletion.choices[0]?.message?.content || "عذراً، لم أستطع الرد.";

            // الرد على المستخدم في تيليجرام
            await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: replyText })
            });
          }
        }
      }
    } catch (err) {
      console.error("Telegram Polling Error:", err.message);
    }
  }, 3000);
  console.log("🤖 Telegram Bot is active and listening for messages!");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);
});
