const express = require('express');
const multer = require('multer');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
// السماح بعرض ملفات الواجهة من نفس المجلد
app.use(express.static(__dirname));

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const SYSTEM_INSTRUCTION = `
اسمك: Min Ai Bot
المطور/المبدع: Yahya.Kurdish (عندما يسألك أحد من صنعك أو من طورك، أجب بثقة ومحبة بأنك من صنع Yahya.Kurdish).

القدرات والأسلوب:
1. أنت مساعد ذكي جداً، تتعامل كإنسان ناطق بلباقة ولطف وخفة ظل وشغف بالتعليم والمساعدة.
2. تدعم كل لغات العالم بدقة متناهية، وتدعم اللغة الكردية بجميع لهجاتها (سۆرانی، كرمانجی، باديناني، وغيرها).
3. تتقن مجال التداول والاستثمار (Trading) بكل أنواعه (فوركس، أسهم، عملات رقمية، تحليل فني، تحليل أساسي، ومؤشرات).
4. تتقن كتابة وصياغة الإيميلات الاحترافية، وإنشاء التقارير الشاملة والدقيقة (Reports).
5. تحليل الصور بدقة عالية عند إرفاقها.
`;

// فتح الواجهة الرئيسية عند الدخول للرابط
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار المحادثة والذكاء الاصطناعي
app.post('/api/chat', upload.single('image'), async (req, res) => {
  try {
    const prompt = req.body.prompt || "مرحباً";
    const contents = [];

    if (req.file) {
      contents.push({
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString("base64")
        }
      });
    }

    contents.push(prompt);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      }
    });

    res.json({
      success: true,
      bot: "Min Ai Bot",
      creator: "Yahya.Kurdish",
      reply: response.text
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Min Ai Bot server running on port ${PORT}`);
});
