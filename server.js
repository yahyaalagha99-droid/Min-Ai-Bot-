import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const upload = multer({ dest: "uploads/" });
const API_KEY = process.env.GROQ_API_KEY;

// ---------------------- TEXT ----------------------
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
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are MAi Bot created by Yahya Kurdish." },
          { role: "user", content: userText }
        ]
      })
    });

    const data = await response.json();
    res.json({ reply: data.choices[0].message.content });

  } catch (err) {
    res.json({ error: err.message });
  }
});

// ---------------------- IMAGE ----------------------
app.post("/api/image", upload.single("image"), async (req, res) => {
  try {
    const imgPath = req.file.path;
    const imgBuffer = fs.readFileSync(imgPath);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are MAi Bot created by Yahya Kurdish." },
          {
            role: "user",
            content: [
              { type: "input_text", text: "حلل هذه الصورة" },
              {
                type: "input_image",
                image_url: `data:image/jpeg;base64,${imgBuffer.toString("base64")}`
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    fs.unlinkSync(imgPath);

    res.json({ reply: data.choices[0].message.content });

  } catch (err) {
    res.json({ error: err.message });
  }
});

// ---------------------- AUDIO ----------------------
app.post("/api/audio", upload.single("audio"), async (req, res) => {
  try {
    const audioPath = req.file.path;
    const audioBuffer = fs.readFileSync(audioPath);

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`
      },
      body: audioBuffer
    });

    const data = await response.json();
    fs.unlinkSync(audioPath);

    res.json({ text: data.text });

  } catch (err) {
    res.json({ error: err.message });
  }
});

// ---------------------- START SERVER ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MAi Bot API running on port ${PORT}`);
});
