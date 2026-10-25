// server.js - الملف الأساسي للسيرفر
const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');
const { SYSTEM_INSTRUCTION, BOT_NAME, DEVELOPER_NAME, GROQ_MODEL } = require('./config');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// توفير الملفات الثابتة من المجلد الحالي وجمیع المجلدات المحتملة
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'Frontend')));
app.use(express.static(path.join(__dirname, 'public')));

// جلب مفتاح Groq تلقائياً من Environment Variables
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// صفحة البداية وعرض الواجهة بدقة
app.get('/', (req, res) => {
  const possiblePaths = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'Frontend', 'index.html'),
    path.join(__dirname, 'public', 'index.html')
  ];

  // إرسال أول ملف index.html يتم يجده السيرفر
  for (const filePath of possiblePaths) {
    if (require('fs').existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  
  res.status(404).send('ملف الواجهة index.html غير موجود في المشروع!');
});

// API استقبال المحادثة
app.post('/api/chat', upload.single('image'), async (req, res) => {
  try {
    const prompt = req.body.prompt || "مرحباً";
    
    const clientTime = req.body.clientTime || new Date().toLocaleString();
    const clientTimeZone = req.body.clientTimeZone || "Unknown";

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
