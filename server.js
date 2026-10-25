// server.js - السيرفر المحسّن مع نظام احتياطي للصور لضمان عدم حدوث أخطاء
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

// ذاكرة مؤقتة لموقع الويب
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

// API موقع الويب
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let prompt = req.body.prompt || "";
    const clientTime = req.body.clientTime || new Date().toLocaleString();
    const clientTimeZone = req.body.clientTimeZone || "Unknown";

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        prompt += `\n[ملاحظة: قام المستخدم برفع صورة باسم (${req.file.originalname})]`;
      } else {
        const fileContent = req.file.buffer.toString('utf8');
        const trimmedContent = fileContent.length > 2000 ? fileContent.substring(0, 2000) + "\n[تم اقتصاص باقي الملف...]" : fileContent;
        prompt += `\n[محتوى الملف المرفق (${req.file.originalname}):\n${trimmedContent}\n]`;
      }
    }

    const timeContext = `[Context -> Local Time: ${clientTime}, TimeZone: ${clientTimeZone}, Year: 2026]`;
    const fullUserMessage = `${timeContext}\n${prompt}`;

    conversationHistory.push({ role: 'user', content: fullUserMessage });

    if (conversationHistory.length > 8) {
      const systemPrompt = conversationHistory[0];
      conversationHistory = [systemPrompt, ...conversationHistory.slice(-6)];
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: conversationHistory,
      model: GROQ_MODEL,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "لم يتم استلام رد.";
    conversationHistory.push({ role: 'assistant', content: reply });

    res.json({ success: true, bot: BOT_NAME, creator: DEVELOPER_NAME, reply: reply });

  } catch (error) {
    console.error("Server Error:", error);
    conversationHistory = [{ role: 'system', content: SYSTEM_INSTRUCTION }];
    res.status(500).json({ success: false, error: "تم إعادة ضبط الذاكرة مؤقتاً. حاول مجدداً." });
  }
});

// ----------------------------------------------------
// نظام تيليجرام مع معالجة آمنة جداً وفورية للرسائل والصور
// ----------------------------------------------------
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
              let userMessages = [{ role: 'system', content: SYSTEM_INSTRUCTION }];
              let userContent = null;
              let activeModel = GROQ_MODEL;

              // محاولة معالجة الصورة إذا وجدت
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
                    const arrayBuffer = await imgRes.arrayBuffer();
                    const base64Image = Buffer.from(arrayBuffer).toString('base64');
                    const imageUrl = `data:image/jpeg;base64,${base64Image}`;

                    const caption = update.message.caption || "ماذا توجد في هذه الصورة؟ قم بتحليلها بدقة واشرحها لي.";
                    
                    userContent = [
                      { type: "text", text: caption },
                      { type: "image_url", image_url: { url: imageUrl } }
                    ];
                    activeModel = "llama-3.2-11b-vision-preview";
                  }
                } catch (imgErr) {
                  console.log("Image fetch skipped, falling back to text:", imgErr.message);
                  userContent = update.message.caption || "مرحباً، أرسلت لي صورة ولكن تعذر تحميلها مؤقتم, كيف يمكنني مساعدتك؟";
                }
              } 
              
              // المعالجة النصية أو البديلة
              if (!userContent && update.message.text) {
                userContent = update.message.text;
              }

              if (userContent) {
                userMessages.push({ role: 'user', content: userContent });

                const chatCompletion = await groq.chat.completions.create({
                  messages: userMessages,
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
              console.error("Error processing message:", innerErr);
              await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: "أهلاً بك! استلمت رسالتك، جارٍ العمل على الرد بكل ذكاء." })
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Telegram Polling Error:", err.message);
    }
  }, 3000);
  console.log("🤖 Telegram Bot is active with safe fallback handling!");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);
});
