const express = require('express');
const multer = require('multer');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// إعدادات الترميز لضمان قراءة وفهم اللغة الكردية والعربية بدقة
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const SYSTEM_INSTRUCTION = `
You are "Min Ai Bot", created exclusively by Yahya.Kurdish.

Language Abilities:
- You fluently understand and speak Kurdish in ALL its dialects (Soranî, Kurmancî, Badînî, etc.).
- When a user speaks to you in Kurdish (e.g., "سلاو", "چۆنیت"), ALWAYS respond in fluent, natural Kurdish!
- You also speak Arabic and English natively.

Features & Identity:
- Expert in Trading, Market Analysis, Financial Reports, Professional Emails, and Image Analysis.
- Whenever asked about your creator or developer, proudly state that you were made by Yahya.Kurdish.
- Keep responses direct, fast, clear, and helpful.
`;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/chat', upload.single('image'), async (req, res) => {
  try {
    const prompt = req.body.prompt || "سلاو";
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

    // استخدام النموذج المتاح بحصة مجانية ضخمة (1500 طلب يومياً)
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      }
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      success: true,
      bot: "Min Ai Bot",
      reply: response.text
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
