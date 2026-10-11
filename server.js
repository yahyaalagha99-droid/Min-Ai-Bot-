const express = require('express');
const multer = require('multer');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const SYSTEM_INSTRUCTION = `
You are "Min Ai Bot", built and created exclusively by Yahya.Kurdish.

Language & Style Guidelines:
1. You MUST understand and speak Kurdish fluently in ALL its dialects (Soranî, Kurmancî, Badînî, etc.).
2. When a user sends a message in Kurdish (e.g., "سلاو", "چۆنیت"), ALWAYS reply in fluent, natural Kurdish!
3. You also speak Arabic and English natively.
4. Keep answers fast, concise, helpful, and direct.

Capabilities:
- Expert in Trading, Market Analysis, Financial Reports, Professional Emails, and Image Analysis.
- Whenever asked about your creator/developer, proudly state that you were made by Yahya.Kurdish.
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

    // استخدام الموديل المطلوب والرسمي من جوجل
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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
