const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');
const { SYSTEM_INSTRUCTION, BOT_NAME, DEVELOPER_NAME, GROQ_MODEL } = require('./config');
const { startTelegramBot } = require('./telegram');

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 }, storage: multer.memoryStorage() });

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'Frontend')));
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// الصفحة الرئيسية
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

// ---------------------- المسار المتوافق مع واجهة الموقع (/ask/stream) ----------------------
app.post('/ask/stream', async (req, res) => {
  try {
    let { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      messages = [{ role: 'user', content: "مرحباً" }];
    }

    // تجهيز الرسائل مع النظام (System Instruction)
    const formattedMessages = [
      { role: 'system', content: SYSTEM_INSTRUCTION || "You are MAi Bot." },
      ...messages
    ];

    // اختيار النموذج المناسب (افتراضي أو Vision إذا وُجدت صورة في آخر رسالة)
    let activeModel = GROQ_MODEL || "llama-3.1-8b-instant";
    
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && Array.isArray(lastMsg.content)) {
      const hasImage = lastMsg.content.some(c => c.type === 'image_url');
      if (hasImage) {
        activeModel = "llama-3.2-11b-vision-preview";
      }
    }

    // إعداد الـ Stream للرد الفوري
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await groq.chat.completions.create({
      messages: formattedMessages,
      model: activeModel,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error) {
    console.error("Stream API Error:", error);
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ error: error.message || "حدث خطأ في السيرفر" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// ---------------------- مسار عام احتياطي (/api/chat) ----------------------
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let prompt = req.body.prompt || "مرحباً";
    let messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: prompt }
    ];
    let activeModel = GROQ_MODEL || "llama-3.1-8b-instant";

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
      error: "حدث خطأ أثناء معالجة الطلب." 
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME || 'MAi Bot'} server running on port ${PORT}`);
  if (typeof startTelegramBot === 'function') {
    startTelegramBot();
  }
});
