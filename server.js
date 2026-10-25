// server.js - السيرفر المحدث لحل مشكلة حجم الملفات والذاكرة
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

// ذاكرة مؤقتة لتسجيل المحادثات
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

// API المحادثة مع معالجة ذكية وآمنة للملفات والصور
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let prompt = req.body.prompt || "";
    const clientTime = req.body.clientTime || new Date().toLocaleString();
    const clientTimeZone = req.body.clientTimeZone || "Unknown";

    // التحقق من نوع الملف المرفق لمنع أخطاء الحجم
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        prompt += `\n[ملاحظة: قام المستخدم برفع صورة باسم (${req.file.originalname})]`;
      } else {
        const fileContent = req.file.buffer.toString('utf8');
        // اقتصاص محتوى الملف إذا كان طويلاً جداً لتفادي تجاوز الحد المسموح
        const trimmedContent = fileContent.length > 2000 ? fileContent.substring(0, 2000) + "\n[تم اقتصاص باقي الملف...]" : fileContent;
        prompt += `\n[محتوى الملف المرفق (${req.file.originalname}):\n${trimmedContent}\n]`;
      }
    }

    const timeContext = `[Context -> Local Time: ${clientTime}, TimeZone: ${clientTimeZone}, Year: 2026]`;
    const fullUserMessage = `${timeContext}\n${prompt}`;

    conversationHistory.push({ role: 'user', content: fullUserMessage });

    // تقليص حجم الذاكرة للحفاظ على حدود النموذج
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

    res.json({
      success: true,
      bot: BOT_NAME,
      creator: DEVELOPER_NAME,
      reply: reply
    });

  } catch (error) {
    console.error("Server Error:", error);
    // مسح الذاكرة مؤقتاً عند حدوث خطأ في الطول لكي يعود العمل فوراً
    conversationHistory = [{ role: 'system', content: SYSTEM_INSTRUCTION }];
    res.status(500).json({ success: false, error: "تم إعادة ضبط الذاكرة لتجاوز الحد الأقصى. حاول إرسال رسالتك الآن مجدداً." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);
});
