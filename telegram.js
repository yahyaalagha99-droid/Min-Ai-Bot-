import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs";
import https from "https";
import FormData from "form-data";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.API_URL || "http://localhost:10000";

console.log("[TG] تشغيل ملف telegram.js ...");
console.log("[TG] TELEGRAM_BOT_TOKEN:", TOKEN ? `موجود (يبدأ بـ ${TOKEN.slice(0, 6)}...)` : "❌ غير موجود!");
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
    bot.on("polling_error", (err) => {
      console.error("[TG] ❌ polling_error:", err.code || "", err.message);
    });

    // ============================================================
    // ⌨️ لوحة الخانات الثابتة (تم الاحتفاظ بها كاملة كما هي)
    // ============================================================
    const mainKeyboard = {
      keyboard: [
        [
          { text: "👤 User", request_users: { request_id: 1 } },                          
          { text: "⭐ Premium", request_users: { request_id: 2, user_is_premium: true } }, 
          { text: "👽 Bot", request_users: { request_id: 3, user_is_bot: true } }          
        ],
        [
          { text: "👥 Group", request_chat: { request_id: 4, chat_is_channel: false } },   
          { text: "📢 Channel", request_chat: { request_id: 5, chat_is_channel: true } },  
          { text: "💬 Forum", request_chat: { request_id: 6, chat_is_channel: false, chat_is_forum: true } } 
        ],
        // إضافة زر التداول الجديد في اللوحة الثابتة لسهولة الوصول إليه
        ["📈 قسم التداول", "🆔 آي دي الخاص بي"]
      ],
      resize_keyboard: true,
      is_persistent: true 
    };

    // تقدير سنة تسجيل حساب تيليجرام من الآي دي
    function estimateRegistration(id) {
      const ranges = [
        [8300000000, "2026"], [7200000000, "2025"], [6300000000, "2024"],
        [3300000000, "2023"], [1900000000, "2022"], [1200000000, "2021"],
        [900000000, "2020"], [650000000, "2019"], [450000000, "2018"],
        [300000000, "2017"], [200000000, "2016"], [100000000, "2015"],
        [0, "2014 أو أقدم"]
      ];
      for (const [limit, year] of ranges) {
        if (id >= limit) return year;
      }
      return "غير معروف";
    }

    // بطاقة معلومات شخص
    function userCard(id, name, username) {
      return `🆔 الآي دي: ${id}\n` +
        `📝 الاسم: ${name || "—"}\n` +
        `🔗 اليوزر: ${username ? "@" + username : "لا يوجد"}\n` +
        `📅 التسجيل (تقريبي): ${estimateRegistration(id)}`;
    }

    // بطاقة معلومات محادثة (مجموعة/قناة/منتدى)
    function chatCard(id, title, username, type) {
      return `🆔 الآي دي: ${id}\n` +
        `📝 الاسم: ${title || "—"}\n` +
        `🔗 اليوزر: ${username ? "@" + username : "خاص/لا يوجد"}\n` +
        `النوع: ${type}`;
    }

    // ---------------------- أمر البدء ----------------------
    bot.onText(/\/start/, (msg) => {
      console.log(`[TG] وصل /start من ${msg.chat.id}`);
      bot.sendMessage(msg.chat.id,
        `أهلاً ${msg.from.first_name} 👋\n` +
        `أنا بوت التحليل الذكي والتداول الخاص بك.\n` +
        `أقدر أساعدك في العملات الرقمية، الفوركس، والأسهم.\n` +
        `اختر من الأقسام بالأسفل أو أرسل كود التداول مباشرة.`,
        { 
          reply_markup: {
            ...mainKeyboard,
            // أزرار تفاعلية تظهر تحت رسالة الترحيب مباشرة
            inline_keyboard: [
              [
                { text: "🪙 العملات الرقمية", callback_data: "trade_crypto" },
                { text: "📈 الفوركس", callback_data: "trade_forex" }
              ],
              [
                { text: "📊 الأسهم", callback_data: "trade_stocks" },
                { text: "⚡ تنفيذ صفقة / إدخال كود", callback_data: "enter_trade_code" }
              ]
            ]
          } 
        }
      );
    });

    // ---------------------- معالج الأزرار التفاعلية (Inline Buttons) ----------------------
    bot.on("callback_query", async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;

      try {
        if (data === "trade_crypto") {
          await bot.sendMessage(chatId, "🪙 **قسم العملات الرقمية:**\nأرسل اسم العملة أو الكود الخاص بالتحليل أو التداول.");
        } else if (data === "trade_forex") {
          await bot.sendMessage(chatId, "📈 **قسم الفوركس:**\nأرسل زوج العملات المطلوب تحليله أو التداول فيه.");
        } else if (data === "trade_stocks") {
          await bot.sendMessage(chatId, "📊 **قسم الأسهم:**\nأرسل رمز السهم المطلوب.");
        } else if (data === "enter_trade_code") {
          await bot.sendMessage(chatId, "✍️ **إدخال كود التداول:**\nالرجاء كتابة كود الصفقة أو الأمر في الفراغ (مكان إرسال الرسائل) وسأقوم بتنفيذه.");
        }
        await bot.answerCallbackQuery(query.id);
      } catch (err) {
        console.error("[TG] Callback Error:", err.message);
      }
    });

    // ---------------------- معالج الرسائل ----------------------
    bot.on("message", async (msg) => {
      try {
        const chatId = msg.chat.id;

        // ===== 1) نتيجة زر "أشخاص" (users_shared) =====
        if (msg.users_shared) {
          const reqLabel = msg.users_shared.request_id === 3 ? "🤖 البوت المختار"
            : msg.users_shared.request_id === 2 ? "⭐ حساب بريميوم" : "👤 حساب";
          for (const su of msg.users_shared.users) {
            await bot.sendMessage(chatId,
              `${reqLabel} — المعلومات:\n\n` +
              userCard(su.user_id, [su.first_name, su.last_name].filter(Boolean).join(" "), su.username));
          }
          return;
        }

        // ===== 2) نتيجة زر "مجموعة/قناة/منتدى" (chat_shared) =====
        if (msg.chat_shared) {
          const cs = msg.chat_shared;
          const typeLabel = cs.request_id === 5 ? "📢 قناة" : cs.request_id === 6 ? "💬 منتدى" : "👥 مجموعة";
          await bot.sendMessage(chatId, chatCard(cs.chat_id, cs.title, cs.username, typeLabel));
          return;
        }

        // ===== 3) زر آي دي الخاص =====
        if (msg.text === "🆔 آي دي الخاص بي") {
          await bot.sendMessage(chatId, userCard(msg.from.id, msg.from.first_name, msg.from.username));
          return;
        }

        // ===== 4) زر قسم التداول الجديد من الكيبورد الثابت =====
        if (msg.text === "📈 قسم التداول") {
          await bot.sendMessage(chatId, "⚡ أهلاً بك في قسم التداول السريع.\nيمكنك كتابة كود التداول الخاص بك هنا أو اختيار القسم المناسب:");
          return;
        }

        // ===== 5) معالجة أكواد التداول المدخلة يدوياً في الفراغ =====
        if (msg.text && (msg.text.startsWith("BUY") || msg.text.startsWith("SELL") || msg.text.startsWith("كود:"))) {
          console.log(`[TG] تم استلام كود تداول من ${chatId}: ${msg.text}`);
          await bot.sendMessage(chatId, `🔄 جاري معالجة وتنفيذ كود التداول المدخل:\n\`${msg.text}\``, { parse_mode: "Markdown" });
          // يمكنك ربط عملية التنفيذ الفعلية مع الـ API هنا مستقبلاً
          return;
        }

        // ===== 6) باقي النصوص → الذكاء الاصطناعي (كما كانت تماماً) =====
        if (!msg.text || msg.text.startsWith("/")) return;

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

    // ---------------------- IMAGE (بدون أي تغيير) ----------------------
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

    // ---------------------- AUDIO (بدون أي تغيير) ----------------------
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
