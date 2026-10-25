import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs";
import https from "https";
import FormData from "form-data";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.API_URL;

const bot = new TelegramBot(TOKEN, { polling: true });

// ---------------------- TEXT ----------------------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (msg.text && !msg.photo && !msg.voice) {
    const response = await fetch(`${API_URL}/api/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.text })
    });

    const data = await response.json();
    bot.sendMessage(chatId, data.reply || "خطأ بالرد");
  }
});

// ---------------------- IMAGE ----------------------
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const file = await bot.getFile(fileId);

  const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
  const filePath = `image_${Date.now()}.jpg`;

  const fileStream = fs.createWriteStream(filePath);
  https.get(fileUrl, (response) => {
    response.pipe(fileStream).on("finish", async () => {
      const form = new FormData();
      form.append("image", fs.createReadStream(filePath));

      const apiResponse = await fetch(`${API_URL}/api/image`, {
        method: "POST",
        body: form
      });

      const data = await apiResponse.json();
      bot.sendMessage(chatId, data.reply || "خطأ في تحليل الصورة");

      fs.unlinkSync(filePath);
    });
  });
});

// ---------------------- AUDIO ----------------------
bot.on("voice", async (msg) => {
  const chatId = msg.chat.id;

  const fileId = msg.voice.file_id;
  const file = await bot.getFile(fileId);

  const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
  const filePath = `audio_${Date.now()}.ogg`;

  const fileStream = fs.createWriteStream(filePath);
  https.get(fileUrl, (response) => {
    response.pipe(fileStream).on("finish", async () => {
      const form = new FormData();
      form.append("audio", fs.createReadStream(filePath));

      const apiResponse = await fetch(`${API_URL}/api/audio`, {
        method: "POST",
        body: form
      });

      const data = await apiResponse.json();
      bot.sendMessage(chatId, data.text || "خطأ في تحويل الصوت");

      fs.unlinkSync(filePath);
    });
  });
});
