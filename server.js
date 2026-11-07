import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.join(__dirname, "Frontend");
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.static(frontendDir));

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;
const CHAT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const SYSTEM_PROMPT = `أنت مساعد ذكي باسم JARVIS. أجب بلغة المستخدم وبوضوح. قدّم معلومات عامة وتحليلات تعليمية، ولا تدّعِ تنفيذ صفقات أو امتلاك بيانات لحظية ما لم تكن متاحة فعلاً.`;

function requireGroq(res) {
  if (groq) return true;
  res.status(503).json({ error: "الخدمة غير مهيأة: أضف GROQ_API_KEY إلى متغيرات البيئة في Render." });
  return false;
}

async function getReply(prompt) {
  const completion = await groq.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() || "لم يصل رد من المساعد، حاول مرة أخرى.";
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"), (error) => {
    if (error && !res.headersSent) {
      res.status(404).send("ملف الواجهة Frontend/index.html غير موجود.");
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(groq) });
});

// واجهة JARVIS الحالية
app.post("/api/javis-chat", async (req, res) => {
  if (!requireGroq(res)) return;
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) return res.status(400).json({ error: "اكتب رسالة أولاً." });

  try {
    const reply = await getReply(prompt);
    // الصوت اختياري؛ لا نعيد audio إلا عند تهيئة خدمة تحويل صوت منفصلة.
    res.json({ reply, audio: null });
  } catch (error) {
    console.error("/api/javis-chat failed:", error);
    res.status(502).json({ error: "تعذر الحصول على رد من خدمة الذكاء الاصطناعي. تحقق من مفتاح GROQ_API_KEY وسجلات Render." });
  }
});

// يُستخدم هذا المسار أيضاً من بوت Telegram.
app.post("/api/text", async (req, res) => {
  if (!requireGroq(res)) return;
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "لا يوجد نص لإرساله." });

  try {
    res.json({ reply: await getReply(text) });
  } catch (error) {
    console.error("/api/text failed:", error);
    res.status(502).json({ error: "تعذر الحصول على رد من خدمة الذكاء الاصطناعي." });
  }
});

// إرجاع خطأ واضح للمسارات القديمة بدلاً من خطأ 404 مبهم.
app.post("/api/image", upload.single("image"), (_req, res) => {
  res.status(503).json({ error: "تحليل الصور غير مهيأ حالياً على هذا الخادم." });
});
app.post("/api/audio", upload.single("audio"), (_req, res) => {
  res.status(503).json({ error: "تحويل الصوت إلى نص غير مهيأ حالياً على هذا الخادم." });
});

app.use((error, _req, res, _next) => {
  console.error("Request failed:", error);
  if (res.headersSent) return;
  const status = error instanceof multer.MulterError ? 400 : 500;
  res.status(status).json({ error: status === 400 ? "الملف المرفوع كبير جداً أو غير صالح." : "حدث خطأ داخلي في الخادم." });
});

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`JARVIS server listening on port ${PORT}`);
  if (!groq) console.warn("GROQ_API_KEY is missing; AI endpoints will return 503.");
});

if (process.env.TELEGRAM_BOT_TOKEN) {
  import("./telegram.js").catch((error) => {
    console.error("Telegram bot failed to start:", error);
  });
}
