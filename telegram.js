import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs";
import https from "https";
import FormData from "form-data";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.API_URL || "http://localhost:10000";

// ===== فحص الإعدادات عند الإقلاع — يطبع السبب بوضوح بلوغات Render =====
console.log("──────────────────────────────────────");
console.log("[TG] تشغيل ملف telegram.js ...");
console.log("[TG] TELEGRAM_BOT_TOKEN:", TOKEN ? `موجود (يبدأ بـ ${TOKEN.slice(0, 6)}...)` : "❌ غير موجود! أضفه في Environment Variables على Render");
console.log("[TG] API_URL:", API_URL);

if (!TOKEN) {
  console.error("[TG] ❌ توقف: لا يوجد TELEGRAM_BOT_TOKEN. البوت لن يعمل.");
} else {
  let bot;
  try {
    bot = new TelegramBot(TOKEN, { polling: true });
    console.log("[TG] ✅ تم إنشاء البوت وبدأ الـ polling ...");
  } catch (err) {
    console.error("[TG] ❌ فشل إنشاء البوت (غالباً التوكن خاطئ):", err.message);
  }

  if (bot) {
    // أي خطأ polling (مثل 409 تعارض، أو 401 توكن خاطئ) يُطبع بدل أن يُبتلع بصمت
    bot.on("polling_error", (err) => {
      console.error("[TG] ❌ polling_error:", err.code || "", err.message);
    });

    // ---------------------- أمر البدء ----------------------
    bot.onText(/\/start/, (msg) => {
      console.log(`[TG] وصل /start من ${msg.chat.id}`);
      bot.sendMessage(msg.chat.id, `أهلاً ${msg.from.first_name} 👋\nأرسل لي نصاً أو صورة أو رسالة صوتية وسأرد عليك.`);
    });

    // ---------------------- TEXT ----------------------
    bot.on("message", async (msg) => {
      try {
        const chatId = msg.chat.id;

        // تجاهل الأوامر والرسائل غير النصية والصور والصوت
        if (!msg.text || msg.text.startsWith("/") || msg.photo || msg.voice) return;

        console.log(`[TG] نص وارد من ${chatId}: ${msg.text.slice(0, 50)}`);

        const response = await fetch(`${API_URL}/api/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: msg.text })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        await bot.sendMessage(chatId, data.reply || "خطأ بالرد");
        console.log(`[TG] ✅ تم الرد على ${chatId}`);
      } catch (error) {
        console.error("[TG] Text Error:", error.message);
        bot.sendMessage(msg.chat.id, "صار خطأ، جرب مرة ثانية 🙏").catch(() => {});
      }
    });

    // ---------------------- IMAGE ----------------------
    bot.on("photo", async (msg) => {
      const chatId = msg.chat.id;
      let filePath = null;
      try {
        console.log(`[TG] صورة واردة من ${chatId}`);
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const file = await bot.getFile(fileId);

        const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
        filePath = `image_${Date.now()}.jpg`;

        await new Promise((resolve, reject) => {
          https.get(fileUrl, (response) => {
            const stream = fs.createWriteStream(filePath);
            response.pipe(stream);
            stream.on("finish", () => stream.close(resolve));
          }).on("error", reject);
        });

        // التعليق المكتوب مع الصورة يُستخدم كسؤال
        const caption = msg.caption || "صف لي ما في هذه الصورة";

        const form = new FormData();
        form.append("image", fs.createReadStream(filePath));
        form.append("prompt", caption);

        const apiResponse = await fetch(`${API_URL}/api/image`, {
          method: "POST",
          body: form
        });

        if (!apiResponse.ok) throw new Error(`HTTP ${apiResponse.status}`);
        const data = await apiResponse.json();
        await bot.sendMessage(chatId, data.reply || "خطأ في تحليل الصورة");
        console.log(`[TG] ✅ تم الرد على الصورة لـ ${chatId}`);
      } catch (error) {
        console.error("[TG] Image Error:", error.message);
        bot.sendMessage(chatId, "صار خطأ بتحليل الصورة، جرب مرة ثانية 🙏").catch(() => {});
      } finally {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    });

    // ---------------------- AUDIO ----------------------
    bot.on("voice", async (msg) => {
      const chatId = msg.chat.id;
      let filePath = null;
      try {
        console.log(`[TG] صوت وارد من ${chatId}`);
        const fileId = msg.voice.file_id;
        const file = await bot.getFile(fileId);

        const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
        filePath = `audio_${Date.now()}.ogg`;

        await new Promise((resolve, reject) => {
          https.get(fileUrl, (response) => {
            const stream = fs.createWriteStream(filePath);
            response.pipe(stream);
            stream.on("finish", () => stream.close(resolve));
          }).on("error", reject);
        });

        const form = new FormData();
        form.append("audio", fs.createReadStream(filePath));

        const apiResponse = await fetch(`${API_URL}/api/audio`, {
          method: "POST",
          body: form
        });

        if (!apiResponse.ok) throw new Error(`HTTP ${apiResponse.status}`);
        const data = await apiResponse.json();
        // ⚠️ مسار الصوت يرجع النص بالمفتاح text وليس reply — لا تغيره
        await bot.sendMessage(chatId, data.text || "خطأ في تحويل الصوت");
        console.log(`[TG] ✅ تم الرد على الصوت لـ ${chatId}`);
      } catch (error) {
        console.error("[TG] Voice Error:", error.message);
        bot.sendMessage(chatId, "صار خطأ بالرسالة الصوتية، جرب مرة ثانية 🙏").catch(() => {});
      } finally {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    });
  }
}
