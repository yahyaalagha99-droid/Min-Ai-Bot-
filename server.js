const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_INSTRUCTION = `
You are "Min Ai Bot", built and created exclusively by Yahya.Kurdish.
- Understand and speak Kurdish fluently in ALL dialects (Soranî, Kurmancî, etc.).
- Speak Arabic and English natively.
- Created solely by Yahya.Kurdish.
`;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/chat', upload.single('image'), async (req, res) => {
  try {
    const prompt = req.body.prompt || "سلاو";
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.6,
      max_tokens: 1024,
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      success: true,
      bot: "Min Ai Bot",
      reply: completion.choices[0]?.message?.content || "عذراً، لم أستطع الإجابة."
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
