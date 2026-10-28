import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs";
import https from "https";
import FormData from "form-data";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.API_URL || "http://localhost:10000";

const bot = new TelegramBot(TOKEN, { polling: true });

// ---------------------- أمر البدء ----------------------
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `أهلاً ${msg.from.first_name} 👋\nأرسل لي نصاً أو صورة أو رسالة صوتية وسأرد عليك.`);
});

// ---------------------- TEXT ----------------------
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;

    // تجاهل الأوامر (تبدأ بـ /) والرسائل غير النصية والصور والصوت
    if (!msg.text || msg.text.startsWith("/") || msg.photo || msg.voice) return;

    const response = await fetch(`${API_URL}/api/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.text })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    bot.sendMessage(chatId, data.reply || "خطأ بالرد");
  } catch (error) {
    console.error("Text Error:", error.message);
    bot.sendMessage(msg.chat.id, "صار خطأ، جرب مرة ثانية 🙏");
  }
});

// ---------------------- IMAGE ----------------------
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  let filePath = null;
  try {
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
    bot.sendMessage(chatId, data.reply || "خطأ في تحليل الصورة");
  } catch (error) {
    console.error("Image Error:", error.message);
    bot.sendMessage(chatId, "صار خطأ بتحليل الصورة، جرب مرة ثانية 🙏");
  } finally {
    // حذف الملف المؤقت دائماً — حتى عند الخطأ
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

// ---------------------- AUDIO ----------------------
bot.on("voice", async (msg) => {
  const chatId = msg.chat.id;
  let filePath = null;
  try {
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
    bot.sendMessage(chatId, data.text || "خطأ في تحويل الصوت");
  } catch (error) {
    console.error("Voice Error:", error.message);
    bot.sendMessage(chatId, "صار خطأ بالرسالة الصوتية، جرب مرة ثانية 🙏");
  } finally {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

console.log("Telegram bot is running...");
