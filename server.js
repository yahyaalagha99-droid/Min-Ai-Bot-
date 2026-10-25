// server.js - السيرفر المطور مع الذاكرة ودعم الملفات
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

// ذاكرة مؤقتة لتخزين سجل المحادثات (Chat History)
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

// API المحادثة المتطورة مع الذاكرة والملفات
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let prompt = req.body.prompt || "";
    const clientTime = req.body.clientTime || new Date().toLocaleString();
    const clientTimeZone = req.body.clientTimeZone || "Unknown";

    // إذا قام المستخدم برفع ملف، نقوم بقراءة محتوياته النصية وإضافتها للرسالة
    if (req.file) {
      const fileContent = req.file.buffer.toString('utf8');
      prompt += `\n[محتوى الملف المرفق (${req.file.originalname}):\n${fileContent}\n]`;
    }

    const timeContext = `[Context -> Local Time: ${clientTime}, TimeZone: ${clientTimeZone}, Year: 2026]`;
    const fullUserMessage = `${timeContext}\n${prompt}`;

    // إضافة رسالة المستخدم إلى الذاكرة
    conversationHistory.push({ role: 'user', content: fullUserMessage });

    // الحفاظ على حجم الذاكرة لئلا يتجاوز الحدود المسموحة للنموذج (آخر 15 رسالة + النظام)
    if (conversationHistory.length > 16) {
      const systemPrompt = conversationHistory[0];
      conversationHistory = [systemPrompt, ...conversationHistory.slice(-14)];
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: conversationHistory,
      model: GROQ_MODEL,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "لم يتم استلام رد.";

    // إضافة رد البوت إلى الذاكرة لتستمر المحادثة بطبيعية
    conversationHistory.push({ role: 'assistant', content: reply });

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
