const axios = require('axios');
require('dotenv').config();

function buildPrompt(query, marketData) {
  const formatted = Object.entries(marketData)
    .map(([coin, d]) => {
      const price = Number(d.usd).toLocaleString();
      const change = d.usd_24h_change?.toFixed(2) ?? 'N/A';
      const cap = d.usd_market_cap
        ? `$${(d.usd_market_cap / 1e9).toFixed(2)}B`
        : 'N/A';
      return `${coin.toUpperCase()}: $${price} | 24h: ${change}% | Cap: ${cap}`;
    })
    .join('\n');

  return `You are a professional crypto market analyst.

User question: "${query}"

Live market data:
${formatted}

Write a sharp 3-paragraph analysis:
1. Current market state based on the data
2. What the 24h trend signals  
3. One specific data-backed insight

Be direct, data-driven, under 200 words. No disclaimers.`;
}

// ── Provider 1: Groq (fastest free LLM, 30 RPM, no card) ──────
async function callGroq(prompt) {
  const res = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq');
  return text;
}

// ── Provider 2: Gemini 2.0 Flash Lite (fixed model name) ───────
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
    },
    { timeout: 15000 }
  );
  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

// ── Provider 3: OpenRouter with updated free models ─────────────
const OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen-2.5-7b-instruct:free',
  'mistralai/mistral-small-24b-instruct-2501:free',
];

async function callOpenRouter(prompt, model) {
  const res = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'CryptoResearchAgent',
      },
      timeout: 20000,
    }
  );
  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response');
  return text;
}

// ── Main: Groq → Gemini → OpenRouter (each model) ──────────────
async function analyzeWithLLM(query, marketData) {
  const prompt = buildPrompt(query, marketData);

  // 1. Groq — fastest, most reliable free option
  if (process.env.GROQ_API_KEY) {
    try {
      console.log('🧠 Trying Groq (Llama 3.3 70B)...');
      const result = await callGroq(prompt);
      console.log('✅ Groq responded');
      return { result, provider: 'groq:llama-3.3-70b' };
    } catch (err) {
      console.warn(`⚠️  Groq failed: ${err.response?.status ?? err.message}`);
    }
  }

  // 2. Gemini direct
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log('🧠 Trying Gemini 2.0 Flash Lite...');
      const result = await callGemini(prompt);
      console.log('✅ Gemini responded');
      return { result, provider: 'gemini-2.0-flash-lite' };
    } catch (err) {
      console.warn(`⚠️  Gemini failed: ${err.response?.status ?? err.message}`);
    }
  }

  // 3. OpenRouter free models
  if (process.env.OPENROUTER_API_KEY) {
    for (const model of OPENROUTER_FREE_MODELS) {
      try {
        console.log(`🔄 Trying OpenRouter: ${model}`);
        const result = await callOpenRouter(prompt, model);
        console.log(`✅ OpenRouter responded (${model})`);
        return { result, provider: `openrouter:${model.split('/')[1]}` };
      } catch (err) {
        console.warn(`⚠️  ${model} failed: ${err.response?.status ?? err.message}`);
      }
    }
  }

  throw new Error('All LLMs failed — add GROQ_API_KEY to .env (free at console.groq.com)');
}

module.exports = { analyzeWithLLM };