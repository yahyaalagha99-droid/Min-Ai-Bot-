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

// خدمة ملفات Frontend (مثل index.html)
app.use(express.static(path.join(__dirname, "Frontend")));

const upload = multer({ dest: "uploads/" });
const API_KEY = process.env.GROQ_API_KEY;

// الصفحة الرئيسية لتشغيل ملف index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "index.html"));
});

// ---------------------- TEXT API ----------------------
app.post("/api/text", async (req, res) => {
  try {
    const userText = req.body.text;

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
          { role: "user", content: userText }
        ]
      })
    });

    const data = await response.json();
    if (data.error) return res.json({ error: data.error.message });

    res.json({ reply: data.choices[0].message.content });

  } catch (err) {
    res.json({ error: err.message });
  }
});

// ---------------------- START SERVER ----------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`MAi Bot API running on port ${PORT}`);
});
