// server.js - الملف الأساسي للسيرفر (لا تقم بتعديله مستقبلاً)
const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');
const { SYSTEM_INSTRUCTION, BOT_NAME, DEVELOPER_NAME, GROQ_MODEL } = require('./config');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// توفير الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'Frontend')));

// جلب مفتاح Groq تلقائياً من Environment Variables
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// صفحة البداية وعرض الواجهة
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'index.html');
  res.sendFile(htmlPath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'Frontend', 'index.html'));
    }
  });
});

// API استقبال المحادثة
app.post('/api/chat', upload.single('image'), async (req, res) => {
  try {
    const prompt = req.body.prompt || "مرحباً";

    // حقن الوقت والتاريخ الحالي ديناميكياً ليعرف البوت الوقت بدقة
    const now = new Date();
    const timeContext = `[Current Context - Time: ${now.toLocaleTimeString()}, Date: ${now.toDateString()}, Year: 2026]`;
    const fullPrompt = `${timeContext}\nUser Message: ${prompt}`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: fullPrompt }
      ],
      model: GROQ_MODEL,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "لم يتم استلام رد.";

    res.json({
      success: true,
      bot: BOT_NAME,
      creator: DEVELOPER_NAME,
      reply: reply
    });

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}, created by ${DEVELOPER_NAME}`);
});
