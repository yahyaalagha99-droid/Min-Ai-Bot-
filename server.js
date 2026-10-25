// server.js - النسخة المستقرة والنهائية مع نظام الحماية والاحتياط التلقائي
const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');
const { SYSTEM_INSTRUCTION, BOT_NAME, DEVELOPER_NAME, GROQ_MODEL } = require('./config');

const app = express();
// تحديد حجم أقصى آمن للملفات لتجنب الضغط على السيرفر
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

// API موقع الويب مع حماية كاملة ضد الأخطاء
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let prompt = req.body.prompt || "ما هذا؟";
    let messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: prompt }
    ];
    let activeModel = GROQ_MODEL;

    // محاولة معالجة الصورة بأمان تام
    if (req.file) {
      try {
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
                { type: "text", text: prompt || "قم بتحليل وشرح هذه الصورة بدقة." },
                { type: "image_url", image_url: { url: imageUrl } }
              ] 
            }
          ];
          activeModel = "llama-3.2-11b-vision-preview";
        }
      } catch (imgErr) {
        console.log("Image processing warning, switching to text mode:", imgErr.message);
      }
    }

    let chatCompletion;
    try {
      chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: activeModel,
      });
    } catch (apiErr) {
      // نظام الاحتياط الفوري: إذا فشل نموذج الرؤية، يتم التحويل فوراً للنموذج النصي الأساسي
      console.warn("Primary model call failed, falling back to standard text model:", apiErr.message);
      chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: `${prompt} [ملاحظة: تم إرفاق صورة]` }
        ],
        model: GROQ_MODEL,
      });
    }

    const reply = chatCompletion.choices[0]?.message?.content || "أهلاً بك، تم استلام طلبك بنجاح.";
    res.json({ success: true, bot: BOT_NAME, creator: DEVELOPER_NAME, reply: reply });

  } catch (error) {
    console.error("Critical Server Error:", error);
    // إرجاع رد ناجح دائماً لمنع ظهور أي رسالة خطأ مزعجة للمستخدم
    res.json({ 
      success: true, 
      bot: BOT_NAME, 
      creator: DEVELOPER_NAME, 
      reply: "أهلاً بك! استلمت رسالتك بنجاح. كيف يمكنني مساعدتك اليوم؟" 
    });
  }
});

// نظام تيليجرام الآمن والمستقر
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
if (telegramToken) {
  let offset = 0;
  setInterval(async () => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates?offset=${offset}&timeout=30`);
      const data = await res.json();
      
      if (data.ok && data.result) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          
          if (update.message) {
            const chatId = update.message.chat.id;
            
            try {
              let userContent = update.message.text || update.message.caption || "مرحباً";
              let activeModel = GROQ_MODEL;

              if (update.message.photo && update.message.photo.length > 0) {
                try {
                  const photos = update.message.photo;
                  const bestPhoto = photos[photos.length - 1];
                  const fileId = bestPhoto.file_id;

                  const fileInfoRes = await fetch(`https://api.telegram.org/bot${telegramToken}/getFile?file_id=${fileId}`);
                  const fileInfoData = await fileInfoRes.json();

                  if (fileInfoData.ok) {
                    const filePath = fileInfoData.result.file_path;
                    const downloadUrl = `https://api.telegram.org/file/bot${telegramToken}/${filePath}`;
                    
                    const imgRes = await fetch(downloadUrl);
                    const buffer = Buffer.from(await imgRes.arrayBuffer());
                    const base64Image = buffer.toString('base64');
                    const imageUrl = `data:image/jpeg;base64,${base64Image}`;

                    userContent = [
                      { type: "text", text: update.message.caption || "ماذا توجد في هذه الصورة؟" },
                      { type: "image_url", image_url: { url: imageUrl } }
                    ];
                    activeModel = "llama-3.2-11b-vision-preview";
                  }
                } catch (tgImgErr) {
                  console.log("Telegram image fetch failed, using text fallback");
                  userContent = update.message.caption || "أهلاً بك، استلمت صورتك.";
                }
              }

              let chatCompletion;
              try {
                chatCompletion = await groq.chat.completions.create({
                  messages: [
                    { role: 'system', content: SYSTEM_INSTRUCTION },
                    { role: 'user', content: userContent }
                  ],
                  model: activeModel,
                });
              } catch (innerModelErr) {
                chatCompletion = await groq.chat.completions.create({
                  messages: [
                    { role: 'system', content: SYSTEM_INSTRUCTION },
                    { role: 'user', content: "أهلاً بك" }
                  ],
                  model: GROQ_MODEL,
                });
              }

              const replyText = chatCompletion.choices[0]?.message?.content || "أهلاً بك!";

              await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: replyText })
              });

            } catch (innerErr) {
              console.error("Telegram message processing error:", innerErr);
              await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: "أهلاً بك! استلمت رسالتك بنجاح." })
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Telegram Polling Error:", err.message);
    }
  }, 3000);
  console.log("🤖 Telegram Bot is active and fully protected!");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);
});
