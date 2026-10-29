// features.js - ملف الوظائف المتغيرة (الأسعار المباشرة)

export async function handleMarketQuery(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  
  try {
    // 1. فحص شامل وصارم لطلب الذهب (يجلب السعر الفوري للأونصة فوراً)
    if (q.includes("ذهب") || q.includes("gold") || q.includes("سعر الذهب") || q.includes("الذهب")) {
      const goldRes = await fetch("https://data-asg.goldprice.org/dbXRates/USD");
      if (goldRes.ok) {
        const data = await goldRes.json();
        const xauPrice = data.items?.[0]?.xauPrice;
        if (xauPrice) {
          return `أونصة الذهب: $${xauPrice.toFixed(2)} USD`;
        }
      }
      
      // مصدر احتياطي فوري للذهب (عبر عملة PAX-Gold الرقمية المدعومة بالذهب)
      const paxgRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd");
      if (paxgRes.ok) {
        const pData = await paxgRes.json();
        const price = pData["pax-gold"]?.usd;
        if (price) {
          return `أونصة الذهب: $${price} USD`;
        }
      }
    }

    // 2. فحص العملات الرقمية بدقة فائقة وإعطاء السعر المباشر
    if (q.includes("بتكوين") || q.includes("bitcoin") || q.includes("btc") || q.includes("ايثريوم") || q.includes("ethereum") || q.includes("eth") || q.includes("سعر") || q.includes("عملة")) {
      const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.coins && searchData.coins.length > 0) {
          const coinId = searchData.coins[0].id;
          const coinSymbol = searchData.coins[0].symbol.toUpperCase();

          const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`);
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const coinInfo = priceData[coinId];
            if (coinInfo) {
              const usdPrice = coinInfo.usd;
              const change24 = coinInfo.usd_24h_change ? coinInfo.usd_24h_change.toFixed(2) : "0.00";
              return `${coinSymbol}: $${usdPrice} USD (التغير 24س: ${change24}%)`;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Features Error:", e.message);
  }
  return null;
}
