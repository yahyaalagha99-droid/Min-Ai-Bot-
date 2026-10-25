import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// خدمة ملفات Frontend
app.use(express.static(path.join(__dirname, "Frontend")));

const upload = multer({ dest: "uploads/" });
const API_KEY = process.env.GROQ_API_KEY;

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "index.html"));
});

// ---------------------- STREAM API (/ask/stream) ----------------------
app.post("/ask/stream", async (req, res) => {
  try {
    const { messages } = req.body;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are MAi Bot created by Yahya Kurdish." },
          ...messages
        ],
        stream: true
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      res.setHeader("Content-Type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ error: errData.error?.message || "خطأ من سيرفر Groq" })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const decoder = new TextDecoder();

    for await (const chunk of response.body) {
      const text = decoder.decode(chunk, { stream: true });
      const lines = text.split("\n");
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          res.write("data: [DONE]\n\n");
          continue;
        }

        try {
          const parsed = JSON.parse(payload);
          const token = parsed.choices?.[0]?.delta?.content || "";
          if (token) {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        } catch (e) {
          // تجاهل أخطاء التنسيق المؤقتة
        }
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (err) {
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// ---------------------- START SERVER ----------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`MAi Bot API running on port ${PORT}`);
});
