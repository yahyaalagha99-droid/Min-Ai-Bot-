const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');
const fs = require('fs');
const { SYSTEM_INSTRUCTION, BOT_NAME, DEVELOPER_NAME, GROQ_MODEL } = require('./config');
const { startTelegramBot } = require('./telegram');

const app = express();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  storage: multer.memoryStorage()
});

app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'Frontend')));
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// صفحة الواجهة
app.get('/', (req, res) => {
  const paths = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'Frontend', 'index.html')
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }

  res.status(404).send('ملف الواجهة غير موجود!');
});

// API الدردشة + تحليل الصور
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let prompt = req.body.prompt || "حلل هذه الصورة بدقة.";
    let messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: prompt }
    ];

    let activeModel = GROQ_MODEL;

    // إذا المستخدم أرسل صورة
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const allowed = ['.jpg', '.jpeg', '.png', '.webp'];

      if (allowed.includes(ext)) {
        const base64 = req.file.buffer.toString('base64');
        const mime = req.file.mimetype || 'image/jpeg';

        messages = [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          {
            role: 'user',
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } }
            ]
          }
        ];

        activeModel = "llama-3.2-11b-vision-preview";
      }
    }

    const completion = await groq.chat.completions.create({
      messages,
      model: activeModel
    });

    const reply = completion.choices[0]?.message?.content || "تمت المعالجة بنجاح.";

    res.json({
      success: true,
      bot: BOT_NAME,
      creator: DEVELOPER_NAME,
      reply
    });

  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({
      success: false,
      error: "حدث خطأ أثناء معالجة الصورة أو النص."
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);
  startTelegramBot();
});
