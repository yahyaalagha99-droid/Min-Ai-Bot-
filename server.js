const express = require('express');
const multer = require('multer');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(__dirname));

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const SYSTEM_INSTRUCTION = `
اسمك: Min Ai Bot
المطور/المبدع: Yahya.Kurdish (أنت من صنع Yahya.Kurdish).

أسلوب الرد:
1. أجب بأسلوب مباشر وفوري ومختصر بدون مقدمات طويلة.
2. تدعم جميع اللغات والكردية بجميع لهجاتها.
3. تتقن التداول، صياغة التقارير، وتحليل الصور.
`;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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

    // إلغاء التفكير وإصدار الرد بأقصى سرعة ممكنة
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: {
          thinkingBudget: 0 // إيقاف وقت التفكير بالكامل للرد الفوري
        }
      }
    });

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
