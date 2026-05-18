require('dotenv').config();
const axios = require('axios');

async function runTests() {
  console.log('\n====== API DIAGNOSTIC TEST ======\n');

  // ── Test 1: OpenRouter key validity ──
  console.log('1️⃣  Testing OpenRouter API key...');
  try {
    const res = await axios.get('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      timeout: 10000,
    });
    console.log('   ✅ Key valid — label:', res.data?.data?.label ?? 'unknown');
    console.log('   💰 Credits remaining:', res.data?.data?.usage ?? 'unknown');
  } catch (err) {
    console.log('   ❌ Key invalid or unreachable');
    console.log('   Error:', err.response?.status, err.response?.data ?? err.message);
  }

  // ── Test 2: OpenRouter Llama model ──
  console.log('\n2️⃣  Testing OpenRouter Llama 3.1 free model...');
  try {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [{ role: 'user', content: 'Say: WORKING' }],
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3001',
          'X-Title': 'CryptoResearchAgent',
        },
        timeout: 15000,
      }
    );
    console.log('   ✅ Llama replied:', res.data.choices[0].message.content.trim());
  } catch (err) {
    console.log('   ❌ Llama failed');
    console.log('   Status:', err.response?.status);
    console.log('   Error:', JSON.stringify(err.response?.data ?? err.message));
  }

  // ── Test 3: Gemini direct ──
  console.log('\n3️⃣  Testing Gemini direct...');
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: 'Say: WORKING' }] }] },
      { timeout: 10000 }
    );
    console.log('   ✅ Gemini replied:', res.data.candidates[0].content.parts[0].text.trim());
  } catch (err) {
    console.log('   ❌ Gemini failed');
    console.log('   Status:', err.response?.status);
    console.log('   Error:', err.code ?? err.message);
  }

  // ── Test 4: CoinGecko ──
  console.log('\n4️⃣  Testing CoinGecko...');
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/ping', { timeout: 8000 });
    console.log('   ✅ CoinGecko reachable:', res.data);
  } catch (err) {
    console.log('   ❌ CoinGecko unreachable:', err.code ?? err.message);
  }

  // ── Test 5: CoinCap ──
  console.log('\n5️⃣  Testing CoinCap...');
  try {
    const res = await axios.get('https://api.coincap.io/v2/assets/bitcoin', { timeout: 8000 });
    console.log('   ✅ CoinCap reachable — BTC price: $' + parseFloat(res.data.data.priceUsd).toFixed(2));
  } catch (err) {
    console.log('   ❌ CoinCap unreachable:', err.code ?? err.message);
  }

  console.log('\n====== TEST COMPLETE ======\n');
}

runTests();