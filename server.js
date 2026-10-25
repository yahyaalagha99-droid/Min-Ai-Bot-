// server.js - الملف الأساسي للسيرفر
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

// API استقبال المحادثة مع التقاط موقع وتوقيت المستخدم تلقائياً
app.post('/api/chat', upload.single('image'), async (req, res) => {
  try {
    const prompt = req.body.prompt || "مرحباً";
    
    // استقبال الوقت والمنطقة الزمنية المرسلة من جهاز المستخدم مباشرة
    const clientTime = req.body.clientTime || new Date().toLocaleString();
    const clientTimeZone = req.body.clientTimeZone || "Unknown";

    // دمج السياق الزمني والمكاني للرسالة ليجيب الذكاء الاصطناعي حسب مكان المستخدم
    const timeContext = `[User Location & Time Context -> Local Time: ${clientTime}, TimeZone: ${clientTimeZone}, Year: 2026]. قم بالإجابة على المستخدم بناءً على توقيت ومكان وجوده الحالي إذا سأل عن الوقت أو التاريخ.`;
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
