const express = require('express');
const multer = require('multer');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// دعم ترميز اللغة العربية والكردية بشكل تام
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const SYSTEM_INSTRUCTION = `
You are "Min Ai Bot", created exclusively by Yahya.Kurdish.

Language Abilities:
- You fluently understand and speak Kurdish in ALL its dialects (Soranî, Kurmancî, Badînî, etc.).
- When the user speaks to you in Kurdish, ALWAYS respond in natural, correct, and fluent Kurdish.
- You also speak Arabic and English fluently.

Features:
- Expert in trading, market analysis, reports, email drafting, and image analysis.
- Creator identity: Yahya.Kurdish.
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      }
    });

    // إرسال الرد بترميز UTF-8 الصحيح
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
