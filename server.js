
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const APP_NAME = "My Ai Bot";
const DEVELOPER_NAME = "Yahya.Kurdish";
const API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";

const CACHE_TTL = 600 * 1000;
const HTTP_TIMEOUT = 20000;

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "Frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "index.html"));
});

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const AR_MONTHS = [
  null, "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"
];

const EN_MONTHS = [
  null, "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WMO = {
  0: ["صحو", "Clear sky"],
  1: ["صحو غالباً", "Mainly clear"],
  2: ["غائم جزئياً", "Partly cloudy"],
  3: ["غائم", "Overcast"],
  45: ["ضباب", "Fog"],
  48: ["ضباب متجمّد", "Rime fog"],
  51: ["رذاذ خفيف", "Light drizzle"],
  53: ["رذاذ", "Drizzle"],
  55: ["رذاذ كثيف", "Dense drizzle"],
  61: ["مطر خفيف", "Slight rain"],
  63: ["مطر متوسط", "Moderate rain"],
  65: ["مطر غزير", "Heavy rain"],
  71: ["ثلج خفيف", "Slight snow"],
  73: ["ثلج", "Moderate snow"],
  75: ["ثلج غزير", "Heavy snow"],
  80: ["زخات مطر", "Rain showers"],
  81: ["زخات مطر متوسطة", "Moderate rain showers"],
  82: ["زخات مطر غزيرة", "Heavy rain showers"],
  85: ["زخات ثلج", "Snow showers"],
  86: ["زخات ثلج غزيرة", "Heavy snow showers"],
  95: ["عاصفة رعدية", "Thunderstorm"],
  96: ["عاصفة رعدية مع برد", "Thunderstorm with hail"],
  99: ["عاصفة رعدية شديدة", "Severe thunderstorm"]
};

const cityCache = new Map();

function norm(s) {
  return String(s || "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function detectLang(text) {
  const t = String(text || "");
  if (/[a-zA-Z]/.test(t) && !/[\u0600-\u06FF]/.test(t)) return "en";
  if (/[\u06D5\u06CE\u06C6\u0695\u06B5\u06A4\u06C0]/.test(t)) return "ku";
  return "ar";
}

function validTimezone(value) {
  if (typeof value !== "string" || value.length > 80) return "UTC";

  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

function validLocation(value) {
  if (!value || typeof value !== "object") return null;

  const lat = Number(value.latitude);
  const lon = Number(value.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    latitude: lat,
    longitude: lon
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Weather service HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function nowParts(timezone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date());

  const p = {};
  for (const item of parts) p[item.type] = item.value;

  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) === 24 ? 0 : Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday)
  };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function getNowText(timezone) {
  const n = nowParts(timezone);
  const period = n.hour < 12 ? "صباحاً" : "مساءً";
  const hour = n.hour % 12 || 12;

  return `${AR_DAYS[n.weekday]} ${n.day} ${AR_MONTHS[n.month]} ${n.year}، الساعة ${hour}:${pad(n.minute)} ${period} (${timezone})`;
}

function getNowShort(lang, timezone) {
  const n = nowParts(timezone);
  const hour = n.hour % 12 || 12;
  const time = `${hour}:${pad(n.minute)}`;

  if (lang === "en") {
    return `${EN_DAYS[n.weekday]}, ${EN_MONTHS[n.month]} ${n.day}, ${n.year} — ${time} ${n.hour < 12 ? "AM" : "PM"} (${timezone})`;
  }

  return `${AR_DAYS[n.weekday]} ${n.day} ${AR_MONTHS[n.month]} ${n.year} — الساعة ${time} ${n.hour < 12 ? "صباحاً" : "مساءً"} (${timezone})`;
}

function extractCity(text) {
  const t = String(text || "");

  const patterns = [
    /(?:في|بمدينة|بمنطقة|بمدينه|in)\s+([A-Za-z\u0600-\u06FF\s-]{2,40})/i,
    /(?:طقس|الطقس|حرارة|الحرارة|temperature|weather)\s+([A-Za-z\u0600-\u06FF\s-]{2,40})/i
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);

    if (match) {
      return match[1]
        .replace(/[؟?!.,،؛]/g, "")
        .trim()
        .split(/\s+(?:اليوم|الآن|باجر|غداً|today|now)\b/i)[0]
        .trim();
    }
  }

  return null;
}

async function getWeather(city, location, timezone, lang) {
  const isEnglish = lang === "en";
  const label = city || (isEnglish ? "your current location" : "موقعك الحالي");

  const cacheKey = location
    ? `${location.latitude},${location.longitude}|${lang}`
    : `${norm(city)}|${lang}`;

  const cached = cityCache.get(cacheKey);

  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.value;
  }

  try {
    let latitude;
    let longitude;

    if (location && !city) {
      latitude = location.latitude;
      longitude = location.longitude;
    } else {
      if (!city) {
        return isEnglish
          ? "Please allow location access or tell me your city."
          : "اسمح للبوت باستخدام موقع جهازك، أو اكتب اسم مدينتك حتى أعطيك الطقس الصحيح.";
      }

      const geoUrl =
        "https://geocoding-api.open-meteo.com/v1/search" +
        `?count=1&language=${isEnglish ? "en" : "ar"}` +
        `&name=${encodeURIComponent(city)}`;

      const geo = await fetchJson(geoUrl);
      const result = geo.results?.[0];

      if (!result) {
        return isEnglish
          ? `I couldn't find the city ${city}.`
          : `ما لكيت مدينة باسم ${city}.`;
      }

      latitude = result.latitude;
      longitude = result.longitude;
    }

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code" +
      "&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1";

    const weather = await fetchJson(weatherUrl);

    if (!weather.current) {
      throw new Error("Weather response has no current data");
    }

    const current = weather.current;
    const daily = weather.daily || {};

    const description =
      WMO[current.weather_code]?.[isEnglish ? 1 : 0] || "غير معروف";

    const place = city || label;

    const result = isEnglish
      ? `Weather in ${place}: ${description}\nTemperature: ${current.temperature_2m}°C (feels like ${current.apparent_temperature}°C)\nHumidity: ${current.relative_humidity_2m}%\nWind: ${current.wind_speed_10m} km/h\nToday's range: ${daily.temperature_2m_min?.[0]}° to ${daily.temperature_2m_max?.[0]}°C`
      : `🌤️ الطقس في ${place}: ${description}\n• الحرارة الآن: ${current.temperature_2m}° مئوية\n• المحسوسة: ${current.apparent_temperature}°\n• الرطوبة: ${current.relative_humidity_2m}%\n• سرعة الرياح: ${current.wind_speed_10m} كم/س\n• حرارة اليوم: من ${daily.temperature_2m_min?.[0]}° إلى ${daily.temperature_2m_max?.[0]}°`;

    cityCache.set(cacheKey, {
      value: result,
      time: Date.now()
    });

    return result;

  } catch (error) {
    console.error("WEATHER ERROR:", error);

    return isEnglish
      ? "I couldn't retrieve the weather right now. Please try again."
      : "تعذّر جلب الطقس حالياً. حاول مرة ثانية.";
  }
}

const WEATHER_WORDS = [
  "طقس", "الطقس", "جو", "الجو", "حراره", "الحراره",
  "درجه", "مطر", "امطار", "برد", "رطوبه", "ثلج",
  "رياح", "weather", "temperature", "forecast",
  "کەشوهەوا", "گەرمی", "باران", "بەفر"
];

const TIME_WORDS = [
  "وقت", "الوقت", "ساعه", "الساعه", "time", "clock",
  "کاتژمێر"
];

const DATE_WORDS = [
  "تاريخ", "التاريخ", "يوم", "اليوم", "date", "today",
  "بەروار", "ڕۆژ"
];

function containsWord(text, words) {
  const n = norm(text);
  return words.some(word => n.includes(norm(word)));
}

function hasWeatherWord(text) {
  return containsWord(text, WEATHER_WORDS);
}

function isIdentityQuestion(text) {
  const n = norm(text);

  return [
    "منو صانعك",
    "من صنعك",
    "منو مطورك",
    "من طورك",
    "من عملك",
    "من انشاك",
    "who made you",
    "who created you",
    "who developed you",
    "who is your developer"
  ].some(q => n.includes(norm(q)));
}

function isQuickCommand(text) {
  const t = String(text || "").trim();

  if (!t) return false;
  if (isIdentityQuestion(t)) return true;

  return containsWord(t, WEATHER_WORDS) ||
    containsWord(t, TIME_WORDS) ||
    containsWord(t, DATE_WORDS);
}

async function handleQuickCommand(text, location, timezone) {
  const lang = detectLang(text);

  if (isIdentityQuestion(text)) {
    return DEVELOPER_NAME;
  }

  if (hasWeatherWord(text)) {
    const city = extractCity(text);

    if (city) {
      return getWeather(city, null, timezone, lang);
    }

    if (location) {
      return getWeather(null, location, timezone, lang);
    }

    return lang === "en"
      ? "Please allow location access or tell me your city so I can give you the correct weather."
      : "حتى أعطيك حرارة منطقتك الصحيحة، اسمح للبوت بتحديد موقعك أو اكتب اسم مدينتك.";
  }

  if (containsWord(text, TIME_WORDS) || containsWord(text, DATE_WORDS)) {
    return getNowShort(lang, timezone);
  }

  return null;
}

function extractLastUserMessage(messages = []) {
  if (!Array.isArray(messages)) return "";

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      const content = messages[i].content;

      if (typeof content === "string") return content;

      if (Array.isArray(content)) {
        const item = content.find(x => x.type === "text");
        return item?.text || "";
      }
    }
  }

  return "";
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(m =>
      m &&
      ["user", "assistant"].includes(m.role) &&
      (typeof m.content === "string" || Array.isArray(m.content))
    )
    .slice(-30);
}

function sendSSE(res, value) {
  res.write(`data: ${JSON.stringify(value)}\n\n`);
}

function sendDone(res) {
  res.write("data: [DONE]\n\n");
}

app.post("/ask/stream", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: "GROQ_API_KEY not set in Render"
    });
  }

  const messages = cleanMessages(req.body?.messages);
  const lastUserText = extractLastUserMessage(messages);
  const location = validLocation(req.body?.location);
  const timezone = validTimezone(req.body?.timezone || "UTC");

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  res.write(": connected\n\n");

  if (isIdentityQuestion(lastUserText)) {
    sendSSE(res, { token: DEVELOPER_NAME });
    sendDone(res);
    return res.end();
  }

  if (isQuickCommand(lastUserText)) {
    const quick = await handleQuickCommand(
      lastUserText,
      location,
      timezone
    );

    if (quick) {
      sendSSE(res, { token: quick });
      sendDone(res);
      return res.end();
    }
  }

  const live = [
    `Current date and time: ${getNowText(timezone)}`,
    `User timezone: ${timezone}`,
    "Use the supplied local date and time when asked about time or date.",
    "Never invent live information.",
    "Always answer in the same language as the user's latest message.",
    `If asked who created or developed you, answer with exactly: ${DEVELOPER_NAME}`,
    "Do not mention the developer unless asked."
  ];

  const systemPrompt = `You are ${APP_NAME}, a helpful and intelligent AI assistant.

Developer: ${DEVELOPER_NAME}

Rules:
- Speak naturally, warmly, and clearly.
- Understand the conversation context.
- Answer in the same language used by the user.
- Never invent facts, weather, dates, or times.
- When the user asks who made you, answer exactly ${DEVELOPER_NAME}.
- Never change the developer name.

LIVE INFORMATION:
${live.join("\n")}`;

  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages
  ];

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 1500,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");

      sendSSE(res, {
        error: `API Error ${response.status}: ${errorText.slice(0, 200)}`
      });

      sendDone(res);
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();

        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const token = parsed?.choices?.[0]?.delta?.content || "";

          if (token) {
            sendSSE(res, { token });
          }
        } catch {
          // تجاهل البيانات غير المكتملة
        }
      }
    }

    sendDone(res);
    res.end();

  } catch (error) {
    console.error("CHAT API ERROR:", error);

    if (!res.writableEnded) {
      sendSSE(res, {
        error: "حدث خطأ أثناء الاتصال بخدمة الذكاء الاصطناعي."
      });

      sendDone(res);
      res.end();
    }
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`${APP_NAME} running on port ${PORT}`);
});
