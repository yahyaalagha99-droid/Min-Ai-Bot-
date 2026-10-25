const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');
const { SYSTEM_INSTRUCTION, BOT_NAME, DEVELOPER_NAME, GROQ_MODEL } = require('./config');
const { startTelegramBot } = require('./telegram');

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 }, storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'Frontend')));
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.get('/', (req, res) => {
  const possiblePaths = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'Frontend', 'index.html')
  ];
  for (const filePath of possiblePaths) {
    if (require('fs').existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  res.status(404).send('ملف الواجهة غير موجود!');
});

app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let prompt = req.body.prompt || "ماذا يوجد في هذه الصورة؟";
    let messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: prompt }
    ];
    let activeModel = GROQ_MODEL;

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype || 'image/jpeg';
        const imageUrl = `data:${mimeType};base64,${base64Image}`;
        
        messages = [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { 
            role: 'user', 
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } }
            ] 
          }
        ];
        activeModel = "llama-3.2-11b-vision-preview";
      }
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: messages,
      model: activeModel,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "تم الاستلام بنجاح.";
    
    res.json({ 
      success: true, 
      bot: BOT_NAME, 
      creator: DEVELOPER_NAME, 
      reply: reply 
    });

  } catch (error) {
    console.error("API Error:", error);
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
