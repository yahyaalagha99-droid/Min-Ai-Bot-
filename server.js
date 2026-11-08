
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

// ===== إعدادات الصوت (Groq) =====
// تقدر تغيّرها من Render > Environment بدون تعديل الكود
const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech";
const STT_MODEL = process.env.STT_MODEL || "whisper-large-v3-turbo";
const TTS_MODEL_AR = process.env.TTS_MODEL_AR || "canopylabs/orpheus-arabic-saudi";
const TTS_MODEL_EN = process.env.TTS_MODEL_EN || "canopylabs/orpheus-v1-english";
const TTS_VOICE_AR = process.env.TTS_VOICE_AR || "lulwa";   // abdullah, fahad, sultan, lulwa, noura, aisha
const TTS_VOICE_EN = process.env.TTS_VOICE_EN || "hannah";  // autumn, diana, hannah, austin, daniel, troy
const TTS_MAX_CHARS = 200; // حد Groq لكل طلب

// 🔒 حماية: منع أي أحد يحمّل كود السيرفر أو ملفات الإعداد من المتصفح
app.use((req, res, next) => {
  let p = req.path.toLowerCase();
  try { p = decodeURIComponent(req.path).toLowerCase(); } catch {}

  if (
    p === "/server.js" ||
    /^\/package(-lock)?\.json$/.test(p) ||
    p.startsWith("/node_modules") ||
    p.startsWith("/.") ||
    p.endsWith(".env")
  ) {
    return res.status(404).send("Not found");
  }

  next();
});

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

// ===== أسعار العملات الرقمية الحية =====
const CRYPTO = {
  BTC: { name: "Bitcoin", ar: "بيتكوين", coinbase: "BTC-USD", kraken: "XBTUSD", words: ["بيتكوين", "بتكوين", "البيتكوين", "bitcoin", "btc"] },
  ETH: { name: "Ethereum", ar: "إيثيريوم", coinbase: "ETH-USD", kraken: "ETHUSD", words: ["ايثيريوم", "ايثريوم", "ايثر", "ethereum", "eth"] },
  SOL: { name: "Solana", ar: "سولانا", coinbase: "SOL-USD", kraken: "SOLUSD", words: ["سولانا", "solana", "sol"] },
  XRP: { name: "XRP", ar: "ريبل", coinbase: "XRP-USD", kraken: "XRPUSD", words: ["ريبل", "ripple", "xrp"] },
  DOGE: { name: "Dogecoin", ar: "دوجكوين", coinbase: "DOGE-USD", kraken: "XDGUSD", words: ["دوج", "دوجكوين", "dogecoin", "doge"] }
};

const PRICE_WORDS = [
  "سعر", "اسعار", "كم صار", "بكم", "قيمة", "قيمه",
  "price", "worth", "نرخ"
];

const marketCache = new Map();

function findCryptoSymbol(text) {
  const n = norm(text);

  for (const [symbol, info] of Object.entries(CRYPTO)) {
    const found = info.words.some(w => {
      const word = norm(w);
      // الكلمات الإنجليزية القصيرة لازم تكون كلمة مستقلة
      if (/^[a-z]{2,4}$/.test(word)) {
        return new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(n);
      }
      return n.includes(word);
    });

    if (found) return symbol;
  }

  return null;
}

function isCryptoPriceQuestion(text) {
  return Boolean(findCryptoSymbol(text)) && containsWord(text, PRICE_WORDS);
}

async function getCandles(symbol, interval = "1h") {
  const info = CRYPTO[symbol];
  if (!info) throw new Error("Unknown symbol");

  const granularity = interval === "1d" ? 86400 : interval === "15m" ? 900 : 3600;
  const cacheKey = `${symbol}|${granularity}`;
  const cached = marketCache.get(cacheKey);

  if (cached && Date.now() - cached.time < 15000) {
    return cached.value;
  }

  let candles = null;
  let source = "";

  // المصدر الأول: Coinbase
  try {
    const data = await fetchJson(
      `https://api.exchange.coinbase.com/products/${info.coinbase}/candles?granularity=${granularity}`
    );

    if (Array.isArray(data) && data.length) {
      // الصيغة: [time, low, high, open, close, volume] من الأحدث للأقدم
      candles = data
        .slice(0, 120)
        .map(c => ({ t: c[0] * 1000, l: c[1], h: c[2], o: c[3], c: c[4], v: c[5] }))
        .reverse();
      source = "Coinbase";
    }
  } catch (error) {
    console.error("COINBASE ERROR:", error.message);
  }

  // المصدر البديل: Kraken
  if (!candles) {
    try {
      const data = await fetchJson(
        `https://api.kraken.com/0/public/OHLC?pair=${info.kraken}&interval=${granularity / 60}`
      );

      const key = Object.keys(data.result || {}).find(k => k !== "last");
      const rows = key ? data.result[key] : [];

      if (rows.length) {
        candles = rows.slice(-120).map(c => ({
          t: c[0] * 1000,
          o: Number(c[1]),
          h: Number(c[2]),
          l: Number(c[3]),
          c: Number(c[4]),
          v: Number(c[6])
        }));
        source = "Kraken";
      }
    } catch (error) {
      console.error("KRAKEN ERROR:", error.message);
    }
  }

  if (!candles) throw new Error("All market providers failed");

  const last = candles[candles.length - 1].c;
  const dayAgoIndex = Math.max(0, candles.length - 1 - Math.round(86400 / granularity));
  const ref = candles[dayAgoIndex].o;
  const change = ref ? ((last - ref) / ref) * 100 : 0;

  const value = {
    symbol,
    name: info.name,
    price: last,
    change24h: Number(change.toFixed(2)),
    candles,
    source,
    updated: Date.now()
  };

  marketCache.set(cacheKey, { value, time: Date.now() });
  return value;
}

function formatPrice(p) {
  if (p >= 100) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(3);
  return p.toFixed(5);
}

async function getCryptoPriceText(text) {
  const symbol = findCryptoSymbol(text);
  const lang = detectLang(text);
  const info = CRYPTO[symbol];

  try {
    const data = await getCandles(symbol, "1h");
    const arrow = data.change24h >= 0 ? "▲" : "▼";

    if (lang === "en") {
      return `${info.name} (${symbol}) is at $${formatPrice(data.price)} — ${arrow} ${data.change24h}% in the last 24h. (Source: ${data.source}. Not financial advice.)`;
    }

    return `💰 سعر ${info.ar} (${symbol}) الآن: ${formatPrice(data.price)} دولار
${arrow} التغير خلال 24 ساعة: ${data.change24h}%
المصدر: ${data.source} — هذي معلومة وليست نصيحة استثمارية.`;
  } catch (error) {
    console.error("CRYPTO PRICE ERROR:", error);
    return lang === "en"
      ? "I couldn't fetch the live price right now. Please try again."
      : "تعذّر جلب السعر الحي حالياً. حاول مرة ثانية.";
  }
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
  if (isCryptoPriceQuestion(t)) return true;

  return containsWord(t, WEATHER_WORDS) ||
    containsWord(t, TIME_WORDS) ||
    containsWord(t, DATE_WORDS);
}

async function handleQuickCommand(text, location, timezone) {
  const lang = detectLang(text);

  if (isIdentityQuestion(text)) {
    return `The developer is ${DEVELOPER_NAME}.`;
  }

  // الأسعار قبل الوقت والتاريخ (حتى "سعر البيتكوين اليوم" ما يرجع التاريخ)
  if (isCryptoPriceQuestion(text)) {
    return getCryptoPriceText(text);
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

function buildSystemPrompt(timezone, voice = false) {
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
${live.join("\n")}${voice ? `

VOICE MODE (your answer will be read aloud):
- Keep answers short: 1 to 3 sentences unless the user asks for detail.
- No markdown, no lists, no emojis, no symbols, no links.
- Write numbers in a way that sounds natural when spoken.` : ""}

TRADING / FINANCE:
- You cannot place trades, access bank accounts, or move money.
- Never promise profits or guaranteed returns. Market prices are only provided by the app's live price tool.`;
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
  const voice = req.body?.voice === true;

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
      content: buildSystemPrompt(timezone, voice)
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

// =====================================================
// 🎙 الصوت → نص (Whisper عبر Groq)
// الواجهة ترسل الملف الصوتي مباشرة (audio/webm أو audio/mp4)
// =====================================================
app.post(
  "/transcribe",
  express.raw({ type: () => true, limit: "25mb" }),
  async (req, res) => {
    if (!API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY not set in Render" });
    }

    const audio = req.body;

    if (!Buffer.isBuffer(audio) || audio.length < 1000) {
      return res.status(400).json({ error: "التسجيل قصير جداً أو فارغ." });
    }

    const mime = String(req.headers["content-type"] || "audio/webm").split(";")[0];
    const ext =
      mime.includes("mp4") || mime.includes("m4a") ? "m4a" :
      mime.includes("ogg") ? "ogg" :
      mime.includes("wav") ? "wav" :
      mime.includes("mpeg") || mime.includes("mp3") ? "mp3" :
      "webm";

    try {
      const form = new FormData();
      form.append("file", new Blob([audio], { type: mime }), `voice.${ext}`);
      form.append("model", STT_MODEL);
      form.append("response_format", "json");
      form.append("temperature", "0");

      // اللغة اختيارية: إذا ما انرسلت، Whisper يكتشفها تلقائياً
      const lang = String(req.query.lang || "");
      if (/^[a-z]{2}$/.test(lang)) form.append("language", lang);

      const response = await fetch(GROQ_STT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}` },
        body: form
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("STT ERROR:", response.status, errorText);
        return res.status(502).json({
          error: `STT Error ${response.status}: ${errorText.slice(0, 200)}`
        });
      }

      const data = await response.json();
      res.json({ text: String(data.text || "").trim() });

    } catch (error) {
      console.error("STT ERROR:", error);
      res.status(500).json({ error: "تعذّر تحويل الصوت إلى نص." });
    }
  }
);

// =====================================================
// 🔊 نص → صوت (Orpheus عبر Groq)
// كل طلب حده 200 حرف، والواجهة تقسّم الرد لقطع
// =====================================================
function cleanForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#>`~|•▲▼]/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

app.post("/tts", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not set in Render" });
  }

  const text = cleanForSpeech(req.body?.text).slice(0, TTS_MAX_CHARS);

  if (!text) {
    return res.status(400).json({ error: "No text" });
  }

  const lang = detectLang(text);

  // الكردي ما مدعوم بـ Orpheus → الواجهة تستخدم صوت المتصفح بداله
  if (lang === "ku") {
    return res.status(415).json({ error: "unsupported_language", fallback: true });
  }

  const isArabic = /[؀-ۿ]/.test(text);

  try {
    const response = await fetch(GROQ_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: isArabic ? TTS_MODEL_AR : TTS_MODEL_EN,
        voice: isArabic ? TTS_VOICE_AR : TTS_VOICE_EN,
        input: text,
        response_format: "wav"
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("TTS ERROR:", response.status, errorText);
      return res.status(502).json({
        error: `TTS Error ${response.status}: ${errorText.slice(0, 300)}`,
        fallback: true
      });
    }

    const audio = Buffer.from(await response.arrayBuffer());

    res.set({
      "Content-Type": "audio/wav",
      "Content-Length": audio.length,
      "Cache-Control": "no-store"
    });

    res.send(audio);

  } catch (error) {
    console.error("TTS ERROR:", error);
    res.status(500).json({ error: "تعذّر توليد الصوت.", fallback: true });
  }
});

// =====================================================
// 📈 بيانات السوق الحية (شموع + سعر) — قراءة فقط، بدون تداول
// =====================================================
app.get("/market", async (req, res) => {
  const symbol = String(req.query.symbol || "BTC").toUpperCase();
  const interval = ["15m", "1h", "1d"].includes(req.query.interval)
    ? req.query.interval
    : "1h";

  if (!CRYPTO[symbol]) {
    return res.status(400).json({ error: "Unknown symbol" });
  }

  try {
    res.json(await getCandles(symbol, interval));
  } catch (error) {
    console.error("MARKET ERROR:", error);
    res.status(502).json({ error: "تعذّر جلب بيانات السوق." });
  }
});

app.get("/market/symbols", (req, res) => {
  res.json(
    Object.entries(CRYPTO).map(([symbol, info]) => ({
      symbol,
      name: info.name,
      ar: info.ar
    }))
  );
});

// فحص سريع إن السيرفر شغّال
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: APP_NAME,
    groqKey: Boolean(API_KEY),
    stt: STT_MODEL,
    tts: { ar: `${TTS_MODEL_AR} / ${TTS_VOICE_AR}`, en: `${TTS_MODEL_EN} / ${TTS_VOICE_EN}` }
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`${APP_NAME} running on port ${PORT} 🚀`);
});
