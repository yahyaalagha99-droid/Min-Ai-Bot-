const express = require('express');
const multer = require('multer');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// توفير الملفات الثابتة (Static files)
app.use(express.static(path.join(__dirname, 'public')));
// إذا كان ملف index.html في مجلد اسمه Frontend
app.use(express.static(path.join(__dirname, 'Frontend')));

// استخدام المفتاح من متغيرات البيئة أو المباشر
const apiKey = process.env.GEMINI_API_KEY || "ضع_المفتاح_هنا";
const ai = new GoogleGenAI({ apiKey });

// تعليمات الشخصية
const SYSTEM_INSTRUCTION = `
اسمك: Min Ai Bot
المطور: Yahya.Kurdish
أنت مساعد ذكي ولطيف ومستعد للمساعدة في كل الأوقات.
`;

// عند فتح الرابط الرئيسي يتم إرسال واجهة المستخدم index.html
app.get('/', (req, res) => {
  // للتحقق أولاً من المجلد الرئيسي أو Frontend
  const htmlPath = path.join(__dirname, 'index.html');
  res.sendFile(htmlPath, (err) => {
    if (err) {
      // في حال كان الملف داخل مجلد Frontend
      res.sendFile(path.join(__dirname, 'Frontend', 'index.html'));
    }
  });
});

// API المحادثة
app.post('/api/chat', upload.single('image'), async (req, res) => {
  try {
    const prompt = req.body.prompt || "مرحباً";
    const contents = [];

    if (req.file) {
      contents.push({
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString("base64")
        }
      });
    }

    contents.push(prompt);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      }
    });

    res.json({
      success: true,
      bot: "Min Ai Bot",
      creator: "Yahya.Kurdish",
      reply: response.text()
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Min Ai Bot server running on port ${PORT}`);
});
