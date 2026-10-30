// ===================== features.js =====================
// أسعار لحظية بالثانية (Binance → OKX → Kraken → Coinbase تلقائياً)
// + تحليل استراتيجية + تنفيذ تداول (ورقي افتراضي / حقيقي بمفاتيح Binance)
import crypto from "crypto";

/* ===================== 1) الإعدادات (من Render Environment) ===================== */
const TZ = "Asia/Baghdad";
const TZ_LABEL = "بغداد";
const HTTP_TIMEOUT = 4500;

const BINANCE_BASE = process.env.BINANCE_BASE || "https://api.binance.com";
const LIVE_TRADING = String(process.env.LIVE_TRADING || "false").toLowerCase() === "true";
const BINANCE_KEY = process.env.BINANCE_API_KEY || "";
const BINANCE_SECRET = process.env.BINANCE_API_SECRET || "";
const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE || 70);   // أقل درجة للدخول
const MAX_TRADE_USDT = Number(process.env.MAX_TRADE_USDT || 20);   // أقصى مبلغ للتداول
const PAPER_START = Number(process.env.PAPER_START_USDT || 1000);  // رصيد المحفظة الورقية

/* ===================== 2) جدول الأصول ===================== */
const ASSETS = {
  BTC:  { name: "بيتكوين",   al: ["bitcoin", "btc", "بتكوين", "بيتكوين"], bn: "BTCUSDT", okx: "BTC-USDT", kr: "XBTUSD", cb: "BTC-USD" },
  ETH:  { name: "إيثريوم",   al: ["ethereum", "eth", "ايثريوم", "إيثريوم", "ايثيريوم"], bn: "ETHUSDT", okx: "ETH-USDT", kr: "ETHUSD", cb: "ETH-USD" },
  SOL:  { name: "سولانا",    al: ["solana", "sol", "سولانا"], bn: "SOLUSDT", okx: "SOL-USDT", kr: "SOLUSD", cb: "SOL-USD" },
  BNB:  { name: "بينانس",    al: ["bnb", "binance coin", "بينانس"], bn: "BNBUSDT", okx: "BNB-USDT", kr: "BNBUSD", cb: null },
  XRP:  { name: "ريبل",      al: ["xrp", "ripple", "ريبل"], bn: "XRPUSDT", okx: "XRP-USDT", kr: "XRPUSD", cb: "XRP-USD" },
  DOGE: { name: "دوجكوين",   al: ["dogecoin", "doge", "دوج"], bn: "DOGEUSDT", okx: "DOGE-USDT", kr: "XDGUSD", cb: "DOGE-USD" },
  ADA:  { name: "كاردانو",   al: ["cardano", "ada", "كاردانو"], bn: "ADAUSDT", okx: "ADA-USDT", kr: "ADAUSD", cb: "ADA-USD" },
  TON:  { name: "تون",       al: ["toncoin", "ton", "تون"], bn: "TONUSDT", okx: "TON-USDT", kr: null, cb: null },
  TRX:  { name: "ترون",      al: ["tron", "trx", "ترون"], bn: "TRXUSDT", okx: "TRX-USDT", kr: "TRXUSD", cb: "TRX-USD" },
  LINK: { name: "تشين لينك", al: ["chainlink", "link", "لينك"], bn: "LINKUSDT", okx: "LINK-USDT", kr: "LINKUSD", cb: "LINK-USD" },
  AVAX: { name: "أفالانش",   al: ["avalanche", "avax", "افالانش"], bn: "AVAXUSDT", okx: "AVAX-USDT", kr: "AVAXUSD", cb: "AVAX-USD" },
  DOT:  { name: "بولكادوت",  al: ["polkadot", "dot", "بولكادوت"], bn: "DOTUSDT", okx: "DOT-USDT", kr: "DOTUSD", cb: "DOT-USD" },
  LTC:  { name: "لايتكوين",  al: ["litecoin", "ltc", "لايتكوين"], bn: "LTCUSDT", okx: "LTC-USDT", kr: "LTCUSD", cb: "LTC-USD" },
  SUI:  { name: "سوي",       al: ["sui", "سوي"], bn: "SUIUSDT", okx: "SUI-USDT", kr: null, cb: "SUI-USD" },
  NEAR: { name: "نير",       al: ["near", "نير"], bn: "NEARUSDT", okx: "NEAR-USDT", kr: null, cb: "NEAR-USD" },
  PEPE: { name: "بيبي",      al: ["pepe", "بيبي"], bn: "PEPEUSDT", okx: "PEPE-USDT", kr: null, cb: null }
};

const GOLD_AL = ["ذهب", "الذهب", "gold", "xau", "اونصة", "أونصة", "ounce"];
const SILVER_AL = ["فضة", "الفضة", "silver", "xag"];
const TRADE_AL = ["تداول", "تداولات", "trade", "اشتري", "بيع", "استثمر", "دخل", "دخول", "شراء", "صفقة", "تحليل", "استراتيجية"];

/* ===================== 3) أدوات مساعدة ===================== */
async function fetchJson(url, ms = HTTP_TIMEOUT) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      cache: "no-store",
      headers: { "User-Agent": "MinAiBot/1.0", Accept: "application/json" }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** الوقت الحقيقي بتوقيت بغداد (مو UTC مال السيرفر) */
function timeNow(withSeconds = true) {
  const p = {};
  for (const part of new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "2-digit", month: "2-digit", year: "numeric"
  }).formatToParts(new Date())) p[part.type] = part.value;
  const hh = p.hour === "24" ? "00" : p.hour;
  return withSeconds
    ? `${hh}:${p.minute}:${p.second}`
    : `${hh}:${p.minute}`;
}
function dateNow() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

const fmt = (n) => (n >= 1000 ? Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })
                             : Number(n).toLocaleString("en-US", { maximumFractionDigits: 6 }));

function detectAsset(text = "") {
  const q = String(text).toLowerCase();
  let best = null;
  for (const [k, a] of Object.entries(ASSETS)) {
    for (const al of a.al) {
      if (q.includes(al) && (!best || al.length > best.len)) best = { sym: k, len: al.length, asset: a };
    }
  }
  return best ? best.sym : null;
}

/* ===================== 4) الأسعار اللحظية (أسرع مصدر يفوز) ===================== */
async function priceBinance(sym) {
  const j = await fetchJson(`${BINANCE_BASE}/api/v3/ticker/24hr?symbol=${sym}`);
  return { price: +j.lastPrice, change: +j.priceChangePercent, high: +j.highPrice, low: +j.lowPrice, vol: +j.quoteVolume, src: "Binance" };
}
async function priceOkx(inst) {
  const j = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${inst}`);
  const d = j.data[0], last = +d.last, open = +d.open24h;
  return { price: last, change: open ? ((last - open) / open) * 100 : 0, high: +d.high24h, low: +d.low24h, vol: +d.volCcy24h, src: "OKX" };
}
async function priceKraken(pair) {
  const j = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
  const k = Object.keys(j.result)[0], d = j.result[k];
  const price = +d.c[0], open = +d.o;
  return { price, change: open ? ((price - open) / open) * 100 : 0, high: +d.h[1], low: +d.l[1], vol: +d.v[1], src: "Kraken" };
}
async function priceCoinbase(prod) {
  const j = await fetchJson(`https://api.coinbase.com/v2/prices/${prod}/spot`);
  return { price: +j.data.amount, change: null, high: null, low: null, vol: null, src: "Coinbase" };
}

async function getCryptoPrice(sym) {
  const a = ASSETS[sym];
  if (!a) return null;
  const tasks = [];
  if (a.bn) tasks.push(priceBinance(a.bn));
  if (a.okx) tasks.push(priceOkx(a.okx));
  if (a.kr) tasks.push(priceKraken(a.kr));
  if (a.cb) tasks.push(priceCoinbase(a.cb));
  try {
    const r = await Promise.any(tasks);            // أول مصدر ينجح = أسرع سعر
    if (r && r.price) return { ...r, sym, name: a.name };
  } catch (e) { /* كل المصادر فشلت */ }
  for (const t of tasks) {                          // محاولة تعاقبية كخطة ب
    try { const r = await t; if (r && r.price) return { ...r, sym, name: a.name }; } catch (e) {}
  }
  return null;
}

/** الذهب والفضة (أونصة بالدولار) */
async function getMetalPrice(which = "gold") {
  const eq = which === "gold" ? "XAU" : "XAG";
  try {
    const j = await fetchJson("https://data-asg.goldprice.org/dbXRates/USD");
    const it = j.items && j.items[0];
    if (it) {
      const price = which === "gold" ? it.xauPrice : it.xagPrice;
      const chg = which === "gold" ? it.chgXau : it.chgXag;
      if (price) return { price: +price, change: chg != null ? +chg : null, src: "goldprice.org", which };
    }
  } catch (e) {}
  // بديل: PAXG (ذهب مرمّز = سعر أونصة)
  try {
    const p = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true");
    const g = p["pax-gold"];
    if (g && g.usd) return { price: g.usd, change: g.usd_24h_change, src: "PAXG", which };
  } catch (e) {}
  return null;
}

/* ===================== 5) الشموع + المؤشرات ===================== */
async function candlesOkx(inst, bar = "1m", limit = 300) {
  const j = await fetchJson(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${bar}&limit=${limit}`);
  return j.data.map((c) => ({ t: +c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] })).reverse();
}
async function candlesKraken(pair, interval = 1) {
  const j = await fetchJson(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`);
  const k = Object.keys(j.result).find((x) => x !== "last");
  return j.result[k].map((c) => ({ t: c[0] * 1000, o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[6] }));
}
async function candlesCoinbase(prod, granularity = 60) {
  const j = await fetchJson(`https://api.exchange.coinbase.com/products/${prod}/candles?granularity=${granularity}`);
  return j.map((c) => ({ t: c[0] * 1000, o: c[3], h: c[2], l: c[1], c: c[4], v: c[5] })).reverse();
}
async function candlesBinance(sym, interval = "1m", limit = 300) {
  const j = await fetchJson(`${BINANCE_BASE}/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`);
  return j.map((c) => ({ t: c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] }));
}

async function getCandles(sym, bar = "1m") {
  const a = ASSETS[sym];
  if (!a) return null;
  const krInt = bar === "1m" ? 1 : bar === "5m" ? 5 : bar === "15m" ? 15 : bar === "1h" ? 60 : 1;
  const cbGran = bar === "1m" ? 60 : bar === "5m" ? 300 : bar === "15m" ? 900 : 3600;
  const tryList = [];
  if (a.bn) tryList.push(() => candlesBinance(a.bn, bar, 300));
  if (a.okx) tryList.push(() => candlesOkx(a.okx, bar, 300));
  if (a.kr) tryList.push(() => candlesKraken(a.kr, krInt));
  if (a.cb) tryList.push(() => candlesCoinbase(a.cb, cbGran));
  for (const f of tryList) {
    try { const c = await f(); if (c && c.length > 60) return c; } catch (e) {}
  }
  return null;
}

const ema = (arr, p) => {
  const k = 2 / (p + 1);
  let e = arr[0];
  const out = [e];
  for (let i = 1; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); out.push(e); }
  return out;
};

function rsi(closes, p = 14) {
  let gain = 0, loss = 0;
  for (let i = 1; i <= p; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / p, al = loss / p;
  for (let i = p + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
  }
  if (al === 0) return 100;
  const rs = ag / al;
  return 100 - 100 / (1 + rs);
}

function atr(cs, p = 14) {
  const trs = [];
  for (let i = 1; i < cs.length; i++) {
    const h = cs[i].h, l = cs[i].l, pc = cs[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const a = trs.slice(-p);
  return a.reduce((x, y) => x + y, 0) / a.length;
}

/* ===================== 6) الاستراتيجية ===================== */
/**
 * استراتيجية: تقاطع EMA9/EMA21 + فلتر RSI + تأكيد الميل + حجم التداول،
 * مع وقف خسارة وهدف محسوبين من ATR (تقلّب السوق).
 */
function scoreStrategy(cs) {
  const closes = cs.map((c) => c.c);
  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50);
  const last = closes.length - 1;
  const price = closes[last];
  const r = rsi(closes.slice(-60));
  const a = atr(cs.slice(-60));
  const atrPct = (a / price) * 100;

  const emaUp = e9[last] > e21[last];
  const trendUp = e21[last] > e50[last];
  const cross = e9[last] - e21[last];
  const crossPrev = e9[last - 3] - e21[last - 3];
  const freshCross = (cross > 0) !== (crossPrev > 0);

  const vAvg = cs.slice(-30, -1).reduce((x, c) => x + c.v, 0) / 29;
  const vNow = cs[last].v;
  const volOk = vNow > vAvg * 1.1;

  let score = 50, reasons = [];
  if (emaUp) { score += 15; reasons.push("EMA9 فوق EMA21 (اتجاه صاعد قصير)"); }
  else { score -= 15; reasons.push("EMA9 تحت EMA21 (اتجاه هابط قصير)"); }

  if (trendUp) { score += 10; reasons.push("EMA21 فوق EMA50 (اتجاه عام صاعد)"); }
  else { score -= 10; reasons.push("EMA21 تحت EMA50 (اتجاه عام هابط)"); }

  if (freshCross) { if (cross > 0) { score += 10; reasons.push("تقاطع صعودي جديد"); } else { score -= 10; reasons.push("تقاطع هبوطي جديد"); } }

  if (r < 30) { score += 12; reasons.push(`RSI=${r.toFixed(1)} تشبّع بيعي`); }
  else if (r > 70) { score -= 12; reasons.push(`RSI=${r.toFixed(1)} تشبّع شرائي`); }
  else reasons.push(`RSI=${r.toFixed(1)} في المنتصف`);

  if (volOk) { score += 6; reasons.push("حجم تداول أعلى من المعدّل (تأكيد)"); }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const side = score >= 60 ? "BUY" : score <= 40 ? "SELL" : "HOLD";
  const stop = side === "BUY" ? price - a * 1.5 : price + a * 1.5;
  const target = side === "BUY" ? price + a * 2.5 : price - a * 2.5;

  return { price, score, side, rsi: r, atr: a, atrPct, stop, target, reasons, e9: e9[last], e21: e21[last], e50: e50[last] };
}

/** باك تست سريع على نفس الشموع — يرجّع نسبة نجاح تاريخية (مو وعد بالمستقبل) */
function backtest(cs) {
  const closes = cs.map((c) => c.c);
  const e9 = ema(closes, 9), e21 = ema(closes, 21);
  let pos = null, wins = 0, losses = 0;
  for (let i = 22; i < closes.length; i++) {
    const up = e9[i] > e21[i], upPrev = e9[i - 1] > e21[i - 1];
    const a = atr(cs.slice(Math.max(0, i - 30), i)) || closes[i] * 0.005;
    if (!pos && up && !upPrev) pos = { entry: closes[i], stop: closes[i] - a * 1.5, target: closes[i] + a * 2.5 };
    else if (pos) {
      if (closes[i] <= pos.stop) { losses++; pos = null; }
      else if (closes[i] >= pos.target) { wins++; pos = null; }
    }
    if (!pos && !up && upPrev) pos = null; // خروج عند انعكاس الاتجاه
  }
  const total = wins + losses;
  return { wins, losses, total, winRate: total ? (wins / total) * 100 : null };
}

/* ===================== 7) المحفظة الورقية ===================== */
const paper = { usdt: PAPER_START, positions: {}, history: [] };

function paperBuy(sym, usdt, price, info) {
  const qty = usdt / price;
  paper.usdt -= usdt;
  paper.positions[sym] = { qty, entry: price, stop: info.stop, target: info.target, openedAt: Date.now() };
  paper.history.push({ sym, side: "BUY", qty, price, usdt, at: Date.now() });
  return paper.positions[sym];
}
function paperSell(sym, price) {
  const p = paper.positions[sym];
  if (!p) return null;
  const usdt = p.qty * price;
  const pnl = usdt - p.qty * p.entry;
  paper.usdt += usdt;
  delete paper.positions[sym];
  paper.history.push({ sym, side: "SELL", qty: p.qty, price, usdt, pnl, at: Date.now() });
  return { usdt, pnl, pct: (pnl / (p.qty * p.entry)) * 100 };
}

/* ===================== 8) التنفيذ الحقيقي (Binance) ===================== */
function sign(params) {
  const qs = new URLSearchParams(params).toString();
  const sig = crypto.createHmac("sha256", BINANCE_SECRET).update(qs).digest("hex");
  return `${qs}&signature=${sig}`;
}

async function binanceOrder(symbol, side, quoteOrderQty) {
  const body = sign({
    symbol, side, type: "MARKET", quoteOrderQty: quoteOrderQty.toFixed(2),
    timestamp: Date.now(), recvWindow: 5000
  });
  const r = await fetch(`${BINANCE_BASE}/api/v3/order`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": BINANCE_KEY, "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.msg || `HTTP ${r.status}`);
  return j;
}

async function binanceBalance() {
  const body = sign({ timestamp: Date.now(), recvWindow: 5000 });
  const r = await fetch(`${BINANCE_BASE}/api/v3/account?${body}`, { headers: { "X-MBX-APIKEY": BINANCE_KEY } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.msg || `HTTP ${r.status}`);
  return j.balances.filter((b) => +b.free > 0).map((b) => `${b.asset}: ${(+b.free).toFixed(4)}`).join(" | ");
}

/* ===================== 9) الدوال العامة ===================== */

/** سعر لحظي جاهز للطباعة */
export async function getLivePrice(sym) {
  const p = await getCryptoPrice(sym);
  if (!p) return null;
  const chg = p.change != null ? ` | تغيّر 24س: ${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)}%` : "";
  const hl = p.high && p.low ? ` | أعلى/أدنى: ${fmt(p.high)} / ${fmt(p.low)}` : "";
  return `${p.name} (${sym}): $${fmt(p.price)}${chg}${hl}\n🕐 ${dateNow()} ${timeNow()} (${TZ_LABEL}) — المصدر: ${p.src}`;
}

/** تحليل + استراتيجية جاهزة للطباعة */
export async function analyzeAsset(sym, bar = "1m") {
  const cs = await getCandles(sym, bar);
  if (!cs) return `ما لكيت بيانات شموع لـ ${sym} حالياً`;
  const s = scoreStrategy(cs);
  const bt = backtest(cs);
  const a = ASSETS[sym];
  const lines = [
    `📊 ${a ? a.name : sym} (${sym}) — إطار ${bar}`,
    `السعر: $${fmt(s.price)} | الدرجة: ${s.score}/100 | القرار: ${s.side === "BUY" ? "شراء 🟢" : s.side === "SELL" ? "بيع 🔴" : "انتظار ⚪"}`,
    `RSI: ${s.rsi.toFixed(1)} | ATR: ${s.atr.toFixed(4)} (${s.atrPct.toFixed(2)}%)`,
    `EMA9=${fmt(s.e9)} EMA21=${fmt(s.e21)} EMA50=${fmt(s.e50)}`,
    `وقف الخسارة: $${fmt(s.stop)} | الهدف: $${fmt(s.target)} | العائد/المخاطرة: 1 : 1.67`,
    `الأسباب: ${s.reasons.join(" • ")}`,
    bt.total ? `باك تست على آخر ${cs.length} شمعة: ${bt.wins} ربح / ${bt.losses} خسارة — نسبة نجاح ${bt.winRate.toFixed(1)}%` : "باك تست: بيانات غير كافية",
    `🕐 ${dateNow()} ${timeNow()} (${TZ_LABEL})`
  ];
  return lines.join("\n");
}

/** تنفيذ صفقة (ورقية افتراضياً، حقيقية لو LIVE_TRADING=true) */
export async function autoTrade(sym, usdt = MAX_TRADE_USDT) {
  const cs = await getCandles(sym, "1m");
  if (!cs) return `ما لكيت بيانات لـ ${sym}`;
  const s = scoreStrategy(cs);
  const a = ASSETS[sym];
  const head = `📊 ${a ? a.name : sym} (${sym}) | السعر $${fmt(s.price)} | الدرجة ${s.score}/100`;

  if (s.side === "HOLD" || s.score < MIN_CONFIDENCE) {
    return `${head}\n⚪ لا توجد إشارة قوية الآن (المطلوب ${MIN_CONFIDENCE}+). ما فتحت صفقة.\n${s.reasons.join(" • ")}`;
  }

  const amount = Math.min(usdt, MAX_TRADE_USDT);
  const dir = s.side === "BUY" ? "شراء" : "بيع";

  if (LIVE_TRADING && BINANCE_KEY && BINANCE_SECRET && a && a.bn) {
    try {
      const order = await binanceOrder(a.bn, s.side, amount);
      return `${head}\n✅ صفقة حقيقية ${dir} نُفّذت على Binance\nالمبلغ: ${amount} USDT | OrderId: ${order.orderId}\nالمنفَّذ: ${order.executedQty} | المتوسّط: ${order.cummulativeQuoteQty}\nوقف: $${fmt(s.stop)} | هدف: $${fmt(s.target)}`;
    } catch (e) {
      return `${head}\n⚠️ فشل التنفيذ الحقيقي: ${e.message}\nحاولت ورقياً بدلاً منه...\n` + paperExecute(sym, s, amount);
    }
  }
  return `${head}\n🧪 صفقة ورقية ${dir} (LIVE_TRADING=false)\n` + paperExecute(sym, s, amount);
}

function paperExecute(sym, s, amount) {
  if (s.side === "BUY") {
    const pos = paperBuy(sym, amount, s.price, s);
    return `المبلغ: ${amount} USDT | الكمية: ${pos.qty.toFixed(6)}\nوقف: $${fmt(s.stop)} | هدف: $${fmt(s.target)}\nالرصيد المتبقي: ${paper.usdt.toFixed(2)} USDT\n${s.reasons.join(" • ")}`;
  }
  const r = paperSell(sym, s.price);
  if (!r) return `ما عندي مركز مفتوح على ${sym} حتى أبيعه.`;
  return `أُغلق المركز | الربح/الخسارة: ${r.pnl >= 0 ? "+" : ""}${r.pnl.toFixed(2)} USDT (${r.pct.toFixed(2)}%)\nالرصيد: ${paper.usdt.toFixed(2)} USDT`;
}

/** معلومات المحفظة الورقية */
export function getPortfolio() {
  const pos = Object.entries(paper.positions);
  return `💼 المحفظة (${LIVE_TRADING ? "حقيقية" : "ورقية"})\nالرصيد: ${paper.usdt.toFixed(2)} USDT` +
    (pos.length ? "\n" + pos.map(([k, p]) => `${k}: ${p.qty.toFixed(6)} @ $${fmt(p.entry)}`).join("\n") : "\nلا توجد مراكز مفتوحة");
}

/* ===================== 10) نقطة الدخول القديمة (بنفس التوقيع) ===================== */
export async function handleMarketQuery(query) {
  if (!query) return null;
  const q = String(query).toLowerCase().trim();

  // 1) الذهب والفضة
  if (GOLD_AL.some((w) => q.includes(w)) || SILVER_AL.some((w) => q.includes(w))) {
    const which = SILVER_AL.some((w) => q.includes(w)) ? "silver" : "gold";
    const m = await getMetalPrice(which);
    if (m) {
      const label = which === "gold" ? "أونصة الذهب" : "أونصة الفضة";
      const chg = m.change != null ? ` | التغيّر: ${m.change >= 0 ? "+" : ""}${(+m.change).toFixed(2)}` : "";
      return `${label}: $${fmt(m.price)} USD${chg}\n🕐 ${dateNow()} ${timeNow()} (${TZ_LABEL}) — المصدر: ${m.src}`;
    }
  }

  // 2) عملة رقمية محددة
  const sym = detectAsset(q);
  if (!sym) return null;

  // 3) إذا الطلب فيه تداول/تحليل → استراتيجية + تنفيذ
  if (TRADE_AL.some((w) => q.includes(w))) {
    if (q.includes("حلل") || q.includes("تحليل") || q.includes("استراتيجية")) return await analyzeAsset(sym, "1m");
    return await autoTrade(sym, MAX_TRADE_USDT);
  }

  // 4) سعر فقط — لحظي
  return await getLivePrice(sym);
}

export default { handleMarketQuery, getLivePrice, analyzeAsset, autoTrade, getPortfolio };
