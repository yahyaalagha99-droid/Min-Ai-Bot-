// features.js - ملف الأسعار الفورية اللحظية بالثانية

export async function handleMarketQuery(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  
  // إذا كان النص يحتوي على كلمة ذهب أو سعر
  if (q.includes("ذهب") || q.includes("gold") || q.includes("سعر")) {
    try {
      // محاولة جلب السعر الفوري لأونصة الذهب بالثانية من السوق العالمي
      const goldRes = await fetch("https://data-asg.goldprice.org/dbXRates/USD", { cache: "no-store" });
      if (goldRes.ok) {
        const data = await goldRes.json();
        const xauPrice = data.items?.[0]?.xauPrice;
        if (xauPrice) {
          const timeNow = new Date().toLocaleTimeString();
          return `أونصة الذهب: $${xauPrice.toFixed(2)} USD (محدث الساعة: ${timeNow})`;
        }
      }
      
      // مصدر بديل سريع جداً (PAXG)
      const paxgRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd", { cache: "no-store" });
      if (paxgRes.ok) {
        const pData = await paxgRes.json();
        const price = pData["pax-gold"]?.usd;
        if (price) {
          const timeNow = new Date().toLocaleTimeString();
          return `أونصة الذهب: $${price} USD (محدث الساعة: ${timeNow})`;
        }
      }
    } catch (e) {
      console.error("Gold Fetch Error:", e.message);
    }
  }

  // فحص العملات الرقمية بدقة بالثانية
  if (q.includes("بتكوين") || q.includes("bitcoin") || q.includes("btc") || q.includes("ايثريوم") || q.includes("ethereum") || q.includes("eth")) {
    try {
      const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.coins && searchData.coins.length > 0) {
          const coinId = searchData.coins[0].id;
          const coinSymbol = searchData.coins[0].symbol.toUpperCase();

          const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`, { cache: "no-store" });
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const coinInfo = priceData[coinId];
            if (coinInfo) {
              const usdPrice = coinInfo.usd;
              const change24 = coinInfo.usd_24h_change ? coinInfo.usd_24h_change.toFixed(2) : "0.00";
              const timeNow = new Date().toLocaleTimeString();
              return `${coinSymbol}: $${usdPrice} USD (التغير: ${change24}%) [${timeNow}]`;
            }
          }
        }
      }
    } catch (e) {
      console.error("Crypto Fetch Error:", e.message);
    }
  }

  return null;
}
