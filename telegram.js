const Groq = require('groq-sdk');
const { SYSTEM_INSTRUCTION, GROQ_MODEL } = require('./config');

function startTelegramBot() {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramToken) return;

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  let offset = 0;

  // ذاكرة الجلسة
  const sessionMemory = {};

  function getUserMode(chatId) {
    return sessionMemory[chatId]?.mode || "normal";
  }

  function setUserMode(chatId, mode) {
    if (!sessionMemory[chatId]) sessionMemory[chatId] = {};
    sessionMemory[chatId].mode = mode;
  }

  function resetSession(chatId) {
    sessionMemory[chatId] = {};
  }

  function applyModeToPrompt(mode, userText) {
    switch (mode) {
      case "official":
        return `الرد بأسلوب رسمي ومحترم:\n${userText}`;
      case "soft":
        return `الرد بأسلوب لطيف وهادئ:\n${userText}`;
      case "fun":
        return `الرد بأسلوب مرح وخفيف:\n${userText}`;
      case "tech":
        return `الرد بأسلوب تقني وشرح خطوات:\n${userText}`;
      case "art":
        return `الرد بأسلوب فنان وتحليل ألوان وتصميم:\n${userText}`;
      case "yahya":
        return `الرد بأسلوب يشبه أسلوب المطور Yahya.Kurdish:\n${userText}`;
      default:
        return userText;
    }
  }

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
          let userText = update.message.text || update.message.caption || "مرحباً";
          let activeModel = GROQ_MODEL;

          // أوامر البوت
          if (userText.startsWith("/")) {
            if (userText === "/help") {
              await send(chatId,
                "الأوامر المتاحة:\n" +
                "/help — عرض الأوامر\n" +
                "/about — معلومات عن البوت\n" +
                "/reset — مسح ذاكرة الجلسة\n" +
                "/mode — تغيير شخصية البوت"
              );
              continue;
            }

            if (userText === "/about") {
              await send(chatId,
                "أنا My Ai Bot، مساعد ذكي متطور.\n" +
                "أحلل الصور، أفهم النصوص، وأتكيّف مع أسلوبك."
              );
              continue;
            }

            if (userText === "/reset") {
              resetSession(chatId);
              await send(chatId, "تم مسح ذاكرة الجلسة.");
              continue;
            }

            if (userText.startsWith("/mode")) {
              const mode = userText.split(" ")[1];

              if (!mode) {
                await send(chatId,
                  "اختر شخصية:\n" +
                  "/mode official — رسمي\n" +
                  "/mode soft — لطيف\n" +
                  "/mode fun — مرح\n" +
                  "/mode tech — تقني\n" +
                  "/mode art — فنان\n" +
                  "/mode yahya — أسلوب يشبه المطور\n" +
                  "/mode reset — الوضع الطبيعي"
                );
                continue;
              }

              if (mode === "reset") {
                setUserMode(chatId, "normal");
                await send(chatId, "تم الرجوع للوضع الطبيعي.");
                continue;
              }

              setUserMode(chatId, mode);
              await send(chatId, `تم تغيير الشخصية إلى: ${mode}`);
              continue;
            }
          }

          // معالجة الصور
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

                userText = [
                  {
                    type: "text",
                    text: update.message.caption || "حلل هذه الصورة بدقة."
                  },
                  {
                    type: "image",
                    image: base64Image
                  }
                ];

                activeModel = "llama-3.2-11b-vision-preview";
              }
            } catch (err) {
              console.log("Telegram image processing error:", err);
            }
          }

          // تطبيق الشخصية
          const mode = getUserMode(chatId);
          if (typeof userText === "string") {
            userText = applyModeToPrompt(mode, userText);
          }

          // إرسال الطلب إلى Groq
          const completion = await groq.chat.completions.create({
            messages: [
              { role: 'system', content: SYSTEM_INSTRUCTION },
              { role: 'user', content: userText }
            ],
            model: activeModel
          });

          const replyText =
            completion.choices[0]?.message?.content || "أهلاً بك!";

          await send(chatId, replyText);
        }
      }
    } catch (err) {}
  }, 3000);

  async function send(chatId, text) {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  }
}

module.exports = { startTelegramBot };
