
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const APP_NAME = "Yahya AI";
const DEVELOPER_NAME = "Yahya Kurdish";
const API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";

const CACHE_TTL = 10 * 60 * 1000;
const HTTP_TIMEOUT = 20000;

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "Frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, "index.html"));
    }
  });
});

const AR_DAYS = [
  "الأحد", "الإثنين", "الثلاثاء", "الأربعاء",
  "الخميس", "الجمعة", "السبت"
];

const EN_DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday"
];

const AR_MONTHS = [
  null, "كانون الثاني", "شباط", "آذار", "نيسان",
  "أيار", "حزيران", "تموز", "آب", "أيلول",
  "تشرين الأول", "تشرين الثاني", "كانون الأول"
];

const EN_MONTHS = [
  null, "January", "February", "March", "April",
  "May", "June", "July", "August", "September",
  "October", "November", "December"
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

  if (/[a-zA-Z]/.test(t) && !/[\u0600-\u06FF]/.test(t)) {
    return "en";
  }

  if (/[\u06D5\u06CE\u06C6\u0695\u06B5\u06A4\u06C0]/.test(t)) {
    return "ku";
  }

  return "ar";
}

function validTimezone(value) {
  if (typeof value !== "string" || value.length > 80) {
    return "UTC";
  }

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

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }

  return {
    latitude: lat,
    longitude: lon
  };
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "YahyaAI/1.0",
        ...headers
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

  for (const item of parts) {
    p[item.type] = item.value;
  }

  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) === 24 ? 0 : Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      .indexOf(p.weekday)
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
  const patterns = [
    /(?:في|بمدينة|بمنطقة|بمدينه|in)\s+([A-Za-z\u0600-\u06FF\s-]{2,40})/i,
    /(?:طقس|الطقس|حرارة|الحرارة|temperature|weather)\s+([A-Za-z\u0600-\u06FF\s-]{2,40})/i
  ];

  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);

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

function weatherDescription(code, lang) {
  const item = WMO[code];
  if (!item) return lang === "en" ? "Unknown" : "غير معروف";
  return item[lang === "en" ? 1 : 0];
}

function formatWeather(place, temperature, feelsLike, humidity, wind, description, min, max, lang) {
  if (lang === "en") {
    return `Weather in ${place}: ${description}
Temperature: ${temperature}°C (feels like ${feelsLike}°C)
Humidity: ${humidity}%
Wind: ${wind} km/h
Today's range: ${min}° to ${max}°C`;
  }

  return `🌤️ الطقس في ${place}: ${description}
• الحرارة الآن: ${temperature}° مئوية
• المحسوسة: ${feelsLike}°
• الرطوبة: ${humidity}%
• سرعة الرياح: ${wind} كم/س
• حرارة اليوم: من ${min}° إلى ${max}°`;
}

// الخدمة الأساسية: Open-Meteo
async function getOpenMeteoWeather(latitude, longitude, place, lang) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1";

  const data = await fetchJson(url);

  if (!data.current) {
    throw new Error("Open-Meteo returned no current weather");
  }

  const c = data.current;
  const d = data.daily || {};

  return formatWeather(
    place,
    c.temperature_2m,
    c.apparent_temperature,
    c.relative_humidity_2m,
    c.wind_speed_10m,
    weatherDescription(c.weather_code, lang),
    d.temperature_2m_min?.[0] ?? "—",
    d.temperature_2m_max?.[0] ?? "—",
    lang
  );
}

// الخدمة البديلة: met.no
async function getMetNoWeather(latitude, longitude, place, lang) {
  const url =
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`;

  const data = await fetchJson(url, {
    "User-Agent": "YahyaAI/1.0 weather assistant"
  });

  const item = data.properties?.timeseries?.[0];

  if (!item) {
    throw new Error("met.no returned no weather data");
  }

  const details = item.data?.instant?.details || {};
  const next = item.data?.next_1_hours || item.data?.next_6_hours || {};
  const symbol = next.summary?.symbol_code || "";

  let description = lang === "en" ? "Unknown" : "غير معروف";

  if (symbol.includes("rain")) {
    description = lang === "en" ? "Rain" : "ممطر";
  } else if (symbol.includes("snow")) {
    description = lang === "en" ? "Snow" : "ثلج";
  } else if (symbol.includes("cloud")) {
    description = lang === "en" ? "Cloudy" : "غائم";
  } else if (symbol.includes("fog")) {
    description = lang === "en" ? "Fog" : "ضباب";
  } else if (symbol.includes("clearsky")) {
    description = lang === "en" ? "Clear sky" : "صحو";
  }

  const temperature = details.air_temperature ?? "—";
  const feelsLike = temperature;
  const humidity = details.relative_humidity ?? "—";
  const wind = details.wind_speed ?? "—";

  return formatWeather(
    place,
    temperature,
    feelsLike,
    humidity,
    wind,
    description,
    "—",
    "—",
    lang
  );
}

// خدمة احتياطية إضافية: wttr.in
async function getWttrWeather(locationText, place, lang) {
  const url =
    `https://wttr.in/${encodeURIComponent(locationText)}?format=j1`;

  const data = await fetchJson(url);

  const current = data.current_condition?.[0];
  const today = data.weather?.[0];

  if (!current) {
    throw new Error("wttr.in returned no current weather");
  }

  const description =
    current.lang_ar?.[0]?.value ||
    current.weatherDesc?.[0]?.value ||
    "غير معروف";

  const finalPlace =
    data.nearest_area?.[0]?.areaName?.[0]?.value ||
    place;

  return formatWeather(
    finalPlace,
    current.temp_C,
    current.FeelsLikeC,
    current.humidity,
    current.windspeedKmph,
    description,
    today?.mintempC ?? "—",
    today?.maxtempC ?? "—",
    lang
  );
}

async function getWeather(city, location, timezone, lang) {
  const isEnglish = lang === "en";
  const label = city || (isEnglish ? "your current location" : "موقعك الحالي");

  const cacheKey = location
    ? `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}|${lang}`
    : `${norm(city)}|${lang}`;

  const cached = cityCache.get(cacheKey);

  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.value;
  }

  let latitude = null;
  let longitude = null;

  // إذا توجد إحداثيات الجهاز، نعتمدها مباشرة
  if (location && !city) {
    latitude = location.latitude;
    longitude = location.longitude;
  } else {
    if (!city) {
      return isEnglish
        ? "Please allow location access or tell me your city."
        : "اسمح للبوت بتحديد موقع جهازك، أو اكتب اسم مدينتك حتى أعطيك الطقس الصحيح.";
    }

    // البحث عن إحداثيات المدينة
    try {
      const geoUrl =
        "https://geocoding-api.open-meteo.com/v1/search" +
        `?count=1&language=${isEnglish ? "en" : "ar"}` +
        `&name=${encodeURIComponent(city)}`;

      const geo = await fetchJson(geoUrl);
      const result = geo.results?.[0];

      if (result) {
        latitude = result.latitude;
        longitude = result.longitude;
      }
    } catch (error) {
      console.error("WEATHER GEOCODING ERROR:", error);
    }
  }

  const place = city || label;

  // المحاولة الأولى: Open-Meteo
  if (latitude !== null && longitude !== null) {
    try {
      const result = await getOpenMeteoWeather(
        latitude,
        longitude,
        place,
        lang
      );

      cityCache.set(cacheKey, {
        value: result,
        time: Date.now()
      });

      return result;
    } catch (error) {
      console.error("OPEN METEO ERROR:", error);
    }

    // المحاولة الثانية: met.no
    try {
      const result = await getMetNoWeather(
        latitude,
        longitude,
        place,
        lang
      );

      cityCache.set(cacheKey, {
        value: result,
        time: Date.now()
      });

      return result;
    } catch (error) {
      console.error("MET NO ERROR:", error);
    }
  }

  // المحاولة الثالثة: wttr.in
  try {
    const searchLocation =
      location && !city
        ? `${location.latitude},${location.longitude}`
        : city;

    if (searchLocation) {
      const result = await getWttrWeather(
        searchLocation,
        place,
        lang
      );

      cityCache.set(cacheKey, {
        value: result,
        time: Date.now()
      });

      return result;
    }
  } catch (error) {
    console.error("WTTR ERROR:", error);
  }

  console.error("WEATHER ERROR: All weather providers failed.");

  return isEnglish
    ? "I couldn't retrieve the weather right now. Please try again."
    : "تعذّر جلب الطقس حالياً. حاول مرة ثانية.";
}

const WEATHER_WORDS = [
  "طقس", "الطقس", "جو", "الجو", "حراره", "الحراره",
  "درجة الحرارة", "درجه الحراره", "مطر", "امطار",
  "برد", "رطوبه", "ثلج", "رياح",
  "weather", "temperature", "forecast",
  "کەشوهەوا", "گەرمی", "باران", "بەفر"
];

const TIME_WORDS = [
  "وقت", "الوقت", "ساعه", "الساعه",
  "time", "clock", "کاتژمێر"
];

const DATE_WORDS = [
  "تاريخ", "التاريخ", "يوم", "اليوم",
  "date", "today", "بەروار", "ڕۆژ"
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

  const questions = [
    "who created you",
    "who made you",
    "who is your developer",
    "who built you",
    "منو صانعك",
    "منو المطور",
    "من هو المطور",
    "من هو صانعك",
    "منو مطورك",
    "من طورك",
    "من عملك",
    "من انشاك",
    "کێ دروستت کرد",
    "کێ داهاتووە",
    "کێ پەرەی پێداوی"
  ];

  return questions.some(q => n.includes(norm(q)));
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
    return `The developer is ${DEVELOPER_NAME}.`;
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
      ? "Please allow location access or tell me your city."
      : "حتى أعطيك طقس منطقتك الصحيح، اسمح للبوت بتحديد موقعك أو اكتب اسم مدينتك.";
  }

  if (
    containsWord(text, TIME_WORDS) ||
    containsWord(text, DATE_WORDS)
  ) {
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
      (
        typeof m.content === "string" ||
        Array.isArray(m.content)
      )
    )
    .slice(-30);
}

function sendSSE(res, value) {
  res.write(`data: ${JSON.stringify(value)}\n\n`);
}

function sendDone(res) {
  res.write("data: [DONE]\n\n");
}

function buildSystemPrompt(timezone) {
  const live = [
    `Current date and time: ${getNowText(timezone)}`,
    `User timezone: ${timezone}`,
    "Use the supplied local date and time when asked about time or date.",
    "Never invent live information.",
    "Always answer in the same language as the user's latest message.",
    `If asked who created or developed you, answer with exactly: ${DEVELOPER_NAME}`,
    "Do not mention the developer unless asked."
  ];

  return `You are ${APP_NAME}, a helpful and intelligent AI assistant.

Developer: ${DEVELOPER_NAME}

Rules:
- Speak naturally, warmly, and clearly.
- Understand the conversation context.
- Support Kurdish, Arabic, English and other languages.
- Answer in the same language used by the user.
- Never invent facts, weather, dates, or times.
- When the user asks who made you, answer exactly: ${DEVELOPER_NAME}.
- Never change the developer name.
- Do not mention the developer unless asked.

LIVE INFORMATION:
${live.join("\n")}`;
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
    sendSSE(res, {
      token: DEVELOPER_NAME
    });

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

  const formattedMessages = [
    {
      role: "system",
      content: buildSystemPrompt(timezone)
    },
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
  console.log(`${APP_NAME} running on port ${PORT} 🚀`);
});
