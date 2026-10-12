import express from "express";
import cors from "cors";
import Groq from "groq-sdk";

const app = express();
app.use(cors());
app.use(express.json());

const client = new Groq({ apiKey: "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" });

app.post("/api/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    const response = await client.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        { role: "user", content: userMessage }
      ]
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
