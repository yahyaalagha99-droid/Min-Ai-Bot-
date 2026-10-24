const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// توفير الملفات الثابتة من مجلدات المشروع
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'Frontend')));

// جلب مفتاح Groq تلقائياً من Environment Variables
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// تعليمات الشخصية للبوت
const SYSTEM_INSTRUCTION = `
اسمك: My Ai Bot
المطور: Yahya.Kurdish
أنت مساعد ذكي ولطيف ومستعد للمساعدة في كل الأوقات.
`;

// عند فتح الرابط الرئيسي يتم عرض واجهة HTML
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

    // استخدام نموذج llama-3.3-70b-versatile السريع والأفضل للغة العربية
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
    });

    const reply = chatCompletion.choices[0]?.message?.content || "لم يتم استلام رد.";

    res.json({
      success: true,
      bot: "My Ai Bot",
      creator: "Yahya.Kurdish",
      reply: reply
    });

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`My Ai Bot server running on port ${PORT}`);
});
