const axios = require('axios');
require('dotenv').config();

const COIN_MAP = {
  btc: 'bitcoin', bitcoin: 'bitcoin',
  eth: 'ethereum', ethereum: 'ethereum',
  sol: 'solana', solana: 'solana',
  bnb: 'binancecoin', avax: 'avalanche-2',
  matic: 'matic-network', polygon: 'matic-network',
  link: 'chainlink', dot: 'polkadot',
  ada: 'cardano', xrp: 'ripple',
};

// Binance symbols for fallback
const BINANCE_SYMBOLS = {
  bitcoin: 'BTCUSDT', ethereum: 'ETHUSDT',
  solana: 'SOLUSDT', binancecoin: 'BNBUSDT',
  'avalanche-2': 'AVAXUSDT', 'matic-network': 'MATICUSDT',
  chainlink: 'LINKUSDT', polkadot: 'DOTUSDT',
  cardano: 'ADAUSDT', ripple: 'XRPUSDT',
};

function detectCoins(query) {
  const q = query.toLowerCase();
  const found = Object.keys(COIN_MAP).filter(k => q.includes(k));
  return [...new Set(found.length ? found.map(k => COIN_MAP[k]) : ['bitcoin', 'ethereum'])];
}

// ── Primary: CoinGecko (timeout raised to 15s) ──
async function fetchFromCoinGecko(coinIds) {
  const ids = coinIds.join(',');
  const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: {
      ids,
      vs_currencies: 'usd',
      include_24hr_change: true,
      include_market_cap: true,
      include_24hr_vol: true,
      x_cg_demo_api_key: process.env.COINGECKO_API_KEY,
    },
    timeout: 15000, // raised from 6000 — CoinGecko is just slow
  });
  return res.data;
}

// ── Fallback: Binance public API (no key, globally accessible) ──
async function fetchFromBinance(coinIds) {
  const symbols = coinIds
    .map(id => BINANCE_SYMBOLS[id])
    .filter(Boolean);

  const results = await Promise.all(
    symbols.map(symbol =>
      axios
        .get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
          timeout: 10000,
        })
        .then(r => r.data)
        .catch(() => null)
    )
  );

  // Normalize to match CoinGecko shape
  const normalized = {};
  results.forEach(ticker => {
    if (!ticker) return;
    const coinId = Object.keys(BINANCE_SYMBOLS).find(
      k => BINANCE_SYMBOLS[k] === ticker.symbol
    );
    if (!coinId) return;
    normalized[coinId] = {
      usd: parseFloat(ticker.lastPrice),
      usd_24h_change: parseFloat(ticker.priceChangePercent),
      usd_market_cap: null, // Binance doesn't provide market cap
      usd_24h_vol: parseFloat(ticker.quoteVolume),
    };
  });

  if (Object.keys(normalized).length === 0) {
    throw new Error('Binance returned no usable data');
  }
  return normalized;
}

// ── Main: CoinGecko → Binance fallback ──
async function getMarketData(query) {
  const coinIds = detectCoins(query);

  try {
    console.log('📊 Fetching prices from CoinGecko...');
    const data = await fetchFromCoinGecko(coinIds);
    console.log('✅ CoinGecko responded');
    return data;
  } catch (err) {
    console.warn(`⚠️  CoinGecko failed (${err.message}) — switching to Binance`);
  }

  try {
    console.log('🔄 Fetching prices from Binance...');
    const data = await fetchFromBinance(coinIds);
    console.log('✅ Binance responded');
    return data;
  } catch (err) {
    throw new Error(`All market data sources failed: ${err.message}`);
  }
}

module.exports = { getMarketData };