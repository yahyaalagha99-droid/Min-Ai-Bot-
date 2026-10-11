const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

// ربط الخدمة بمفتاح Groq الخاص بك
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_INSTRUCTION = `
You are "Min Ai Bot", built and created exclusively by Yahya.Kurdish.

Language & Style Guidelines:
1. You MUST understand and speak Kurdish fluently in ALL its dialects (Soranî, Kurmancî, Badînî, etc.).
2. When a user sends a message in Kurdish (e.g., "سلاو", "چۆنیت"), ALWAYS reply in fluent, natural Kurdish!
3. You also speak Arabic and English natively with a friendly, helpful tone.
4. Keep answers extremely fast, concise, professional, and directly to the point.

Capabilities:
- Expert in Trading, Financial Analysis, Chart Interpretations, Reports, and Professional Emails.
- Whenever asked about your creator/developer, proudly state that you were created by Yahya.Kurdish.
`;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/chat', upload.single('image'), async (req, res) => {
  try {
    const prompt = req.body.prompt || "سلاو";

    // استخدام أحدث وأسرع نموذج من Groq
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
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
