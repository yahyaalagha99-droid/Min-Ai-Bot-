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
المطور/المبدع: Yahya.Kurdish (عندما يسألك أحد من صنعك، أجب بثقة ومحبة بأنه Yahya.Kurdish).

القدرات والأسلوب:
1. أنت مساعد ذكي جداً وسريع جداً في الإجابة، إجاباتك مباشرة ومختصرة ودقيقة بدون الإطالة غير الضرورية.
2. تدعم كل لغات العالم، واللغة الكردية بكافة لهجاتها.
3. تتقن التداول، صياغة التقارير والإيميلات، وتحليل الصور.
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

    // إعدادات تسريع الرد والإجابة الفورية
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: {
          thinkingLevel: "low" // تقليل التفكير المطول للرد السريع المباشر
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
