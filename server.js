const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// مفتاحك مباشرة هنا
const apiKey = "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";
const ai = new GoogleGenAI({ apiKey });

// تعليمات الشخصية
const SYSTEM_INSTRUCTION = `
اسمك: Min Ai Bot
المطور: Yahya.Kurdish
... (نفس النص اللي كتبته)
`;

app.get('/', (req, res) => {
  res.send('Min Ai Bot is running smoothly! Created by Yahya.Kurdish');
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
