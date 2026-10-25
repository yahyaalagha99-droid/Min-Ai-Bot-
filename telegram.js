const Groq = require('groq-sdk');
const { SYSTEM_INSTRUCTION, GROQ_MODEL } = require('./config');

function startTelegramBot() {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramToken) return;

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  let offset = 0;

  setInterval(async () => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${telegramToken}/getUpdates?offset=${offset}&timeout=30`
      );
      const data = await res.json();

      if (data.ok && data.result) {
        for (const update of data.result) {
          offset = update.update_id + 1;

          if (!update.message) continue;

          const chatId = update.message.chat.id;
          let userContent = update.message.text || update.message.caption || "مرحباً";
          let activeModel = GROQ_MODEL;

          // معالجة الصور من تيليجرام
          if (update.message.photo && update.message.photo.length > 0) {
            try {
              const photos = update.message.photo;
              const fileId = photos[photos.length - 1].file_id;

              const fileInfoRes = await fetch(
                `https://api.telegram.org/bot${telegramToken}/getFile?file_id=${fileId}`
              );
              const fileInfoData = await fileInfoRes.json();

              if (fileInfoData.ok && fileInfoData.result.file_path) {
                const downloadUrl = `https://api.telegram.org/file/bot${telegramToken}/${fileInfoData.result.file_path}`;
                const imgRes = await fetch(downloadUrl);

                const buffer = Buffer.from(await imgRes.arrayBuffer());
                const base64Image = buffer.toString('base64');

                userContent = [
                  {
                    type: "text",
                    text: update.message.caption || "حلل هذه الصورة بدقة."
                  },
                  {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                  }
                ];

                activeModel = "llama-3.2-11b-vision-preview";
              }
            } catch (err) {
              console.log("Telegram image processing error:", err);
            }
          }

          // إرسال الطلب إلى Groq
          const completion = await groq.chat.completions.create({
            messages: [
              { role: 'system', content: SYSTEM_INSTRUCTION },
              { role: 'user', content: userContent }
            ],
            model: activeModel
          });

          const replyText =
            completion.choices[0]?.message?.content || "أهلاً بك!";

          // إرسال الرد للمستخدم
          await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText
            })
          });
        }
      }
    } catch (err) {
      // تجاهل أخطاء الشبكة المؤقتة
    }
  }, 3000);
}

module.exports = { startTelegramBot };
