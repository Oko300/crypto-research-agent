const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getMarketData } = require('./market');
const { analyzeWithLLM } = require('./llm');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Only activate x402 when ALL three credentials are real
const HAS_X402 = !!(
  process.env.GOATX402_API_KEY &&
  process.env.GOATX402_API_KEY !== 'FILL_AFTER_ONBOARDING' &&
  process.env.GOATX402_API_SECRET &&
  process.env.GOATX402_API_SECRET !== 'FILL_AFTER_ONBOARDING' &&
  process.env.GOATX402_MERCHANT_ID &&
  process.env.GOATX402_MERCHANT_ID !== 'FILL_AFTER_ONBOARDING'
);

const pendingQueries = {};

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    name: 'CryptoResearchAgent',
    status: 'active',
    agentId: process.env.AGENT_ID || 'not registered yet',
    x402: HAS_X402 ? 'active' : 'pending credentials',
    price: '$0.50 USDC',
    chain: 'GOAT Network (chainId 2345)',
    mode: HAS_X402 ? 'PRODUCTION' : 'DEV',
  });
});

// ── Step 1: submit query → get order or direct report in dev mode ──
app.post('/api/research/order', async (req, res) => {
  const { walletAddress, query } = req.body;

  if (!walletAddress || !query) {
    return res.status(400).json({ error: 'walletAddress and query are required' });
  }

  // DEV MODE — no x402 credentials yet, run LLM directly
  if (!HAS_X402) {
    console.log('⚠️  DEV MODE — skipping x402, running LLM pipeline directly');
    try {
      const marketData = await getMarketData(query);
      const { result, provider } = await analyzeWithLLM(query, marketData);
      return res.json({
        report: result,
        provider,
        marketData,
        devMode: true,
        proof: null,
      });
    } catch (err) {
      console.error('DEV MODE error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // PRODUCTION MODE — create real x402 payment order
  try {
    const { createResearchOrder } = require('./x402');
    const order = await createResearchOrder(walletAddress);
    const orderId = order.order_id || order.orderId;
    pendingQueries[orderId] = query;
    console.log('✅ x402 order created:', orderId);
    return res.json({ order, orderId });
  } catch (err) {
    console.error('x402 order error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Step 2: confirm payment → return AI report ──
app.post('/api/research/confirm', async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  const query = pendingQueries[orderId];
  if (!query) {
    return res.status(404).json({ error: 'Order not found or already processed' });
  }

  try {
    const { pollUntilConfirmed, getProof } = require('./x402');
    console.log('⏳ Polling for payment confirmation:', orderId);
    await pollUntilConfirmed(orderId);

    const marketData = await getMarketData(query);
    const { result, provider } = await analyzeWithLLM(query, marketData);
    const proof = await getProof(orderId);

    delete pendingQueries[orderId];

    return res.json({
      report: result,
      provider,
      marketData,
      devMode: false,
      proof: {
        txHash: proof.tx_hash,
        orderId,
        confirmedAt: proof.confirmed_at,
      },
    });
  } catch (err) {
    console.error('Confirm error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🐐 CryptoResearchAgent → http://localhost:${PORT}`);
  console.log(`🧠 LLMs: Gemini (primary) → OpenRouter (fallback)`);
  console.log(`💳 x402: ${HAS_X402 ? 'ACTIVE — production mode' : 'DEV MODE — waiting for credentials'}`);
  console.log(`🔑 Agent ID: ${process.env.AGENT_ID || 'not registered yet'}\n`);
});