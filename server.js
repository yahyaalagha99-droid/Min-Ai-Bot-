// server.js - الكود النهائي والداعم للرؤية الحقيقية على الويب وتيليجرام
const express = require('express');
const multer = require('multer');
const path = require('path');
const Groq = require('groq-sdk');
const { SYSTEM_INSTRUCTION, BOT_NAME, DEVELOPER_NAME, GROQ_MODEL } = require('./config');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'Frontend')));
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let conversationHistory = [
  { role: 'system', content: SYSTEM_INSTRUCTION }
];

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

// API موقع الويب مع الدعم الحقيقي للرؤية
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let prompt = req.body.prompt || "";
    let userContent = prompt;
    let activeModel = GROQ_MODEL;

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        const base64Image = req.file.buffer.toString('base64');
        const imageUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${base64Image}`;
        userContent = [
          { type: "text", text: prompt || "ماذا يوجد في هذه الصورة؟ قم بتحليلها بدقة." },
          { type: "image_url", image_url: { url: imageUrl } }
        ];
        activeModel = "llama-3.2-11b-vision-preview";
      }
    } else {
      userContent = prompt;
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: userContent }
      ],
      model: activeModel,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "لم يتم استلام رد.";
    res.json({ success: true, bot: BOT_NAME, creator: DEVELOPER_NAME, reply: reply });

  } catch (error) {
    console.error("Web Server Vision Error:", error);
    res.status(500).json({ success: false, error: "حدث خطأ أثناء معالجة الصورة أو الرسالة." });
  }
});

// نظام تيليجرام مع الجلب الفعلي والصحيح للصور
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
              let userContent = null;
              let activeModel = GROQ_MODEL;

              // إذا أرسل المستخدم صورة في تيليجرام
              if (update.message.photo && update.message.photo.length > 0) {
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

                  const caption = update.message.caption || "ماذا يوجد في هذه الصورة؟ قم بتحليلها بدقة واشرحها لي.";
                  
                  userContent = [
                    { type: "text", text: caption },
                    { type: "image_url", image_url: { url: imageUrl } }
                  ];
                  activeModel = "llama-3.2-11b-vision-preview";
                }
              } 
              // إذا كانت رسالة نصية اعتيادية
              else if (update.message.text) {
                userContent = update.message.text;
              }

              if (userContent) {
                const chatCompletion = await groq.chat.completions.create({
                  messages: [
                    { role: 'system', content: SYSTEM_INSTRUCTION },
                    { role: 'user', content: userContent }
                  ],
                  model: activeModel,
                });

                const replyText = chatCompletion.choices[0]?.message?.content || "عذراً، لم أستطع الرد.";

                await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: chatId, text: replyText })
                });
              }
            } catch (innerErr) {
              console.error("Telegram Vision Error:", innerErr);
              await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: "عذراً، حدث خطأ أثناء قراءة الصورة. تأكد من حجمها أو حاول مجدداً." })
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Telegram Polling Error:", err.message);
    }
  }, 3000);
  console.log("🤖 Telegram Vision Bot is fully active!");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);
});
