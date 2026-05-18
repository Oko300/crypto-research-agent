const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

// ── HMAC-SHA256 auth headers (exact pattern from GOAT docs) ──
function buildAuthHeaders(body = {}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const apiKey = process.env.GOATX402_API_KEY;
  const secret = process.env.GOATX402_API_SECRET;

  // Merge body + api_key + timestamp, filter empty values, sort keys, build sign string
  const params = { ...body, api_key: apiKey, timestamp };
  const filtered = Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ''
    )
  );
  const sortedKeys = Object.keys(filtered).sort();
  const sigString = sortedKeys.map(k => `${k}=${filtered[k]}`).join('&');

  const sign = crypto
    .createHmac('sha256', secret)
    .update(sigString)
    .digest('hex');

  return {
    'X-API-Key': apiKey,
    'X-Timestamp': timestamp,
    'X-Sign': sign,
    'Content-Type': 'application/json',
  };
}

// ── Create a $0.50 USDC research order ──
async function createResearchOrder(walletAddress) {
  const body = {
    dapp_order_id: `research_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    chain_id: 2345,
    token_symbol: 'USDC',
    from_address: walletAddress,
    amount_wei: '500000', // $0.50 USDC (6 decimals)
    merchant_id: process.env.GOATX402_MERCHANT_ID,
  };

  try {
    const res = await axios.post(
      `${process.env.GOATX402_API_URL}/api/v1/orders`,
      body,
      { headers: buildAuthHeaders(body) }
    );
    return res.data;
  } catch (err) {
    // HTTP 402 is the SUCCESS response in x402 protocol — not an error
    if (err.response?.status === 402) {
      return err.response.data;
    }
    throw new Error(`createOrder failed: ${err.response?.data?.message || err.message}`);
  }
}

// ── Get current order status ──
async function getOrderStatus(orderId) {
  try {
    const res = await axios.get(
      `${process.env.GOATX402_API_URL}/api/v1/orders/${orderId}`,
      { headers: buildAuthHeaders() }
    );
    return res.data;
  } catch (err) {
    throw new Error(`getOrderStatus failed: ${err.response?.data?.message || err.message}`);
  }
}

// ── Get on-chain payment proof ──
async function getProof(orderId) {
  try {
    const res = await axios.get(
      `${process.env.GOATX402_API_URL}/api/v1/orders/${orderId}/proof`,
      { headers: buildAuthHeaders() }
    );
    return res.data;
  } catch (err) {
    throw new Error(`getProof failed: ${err.response?.data?.message || err.message}`);
  }
}

// ── Cancel a stale unpaid order (refunds fee) ──
async function cancelOrder(orderId) {
  try {
    const res = await axios.post(
      `${process.env.GOATX402_API_URL}/api/v1/orders/${orderId}/cancel`,
      {},
      { headers: buildAuthHeaders() }
    );
    return res.data;
  } catch (err) {
    console.warn(`cancelOrder warning: ${err.response?.data?.message || err.message}`);
  }
}

// ── Poll until payment confirmed (or terminal state) ──
async function pollUntilConfirmed(orderId, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const s = await getOrderStatus(orderId);

    // 'status' is the correct field name per GOAT docs
    if (s.status === 'PAYMENT_CONFIRMED') return s;

    if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(s.status)) {
      throw new Error(`Payment ended with status: ${s.status}`);
    }

    console.log(`⏳ Poll ${i + 1}/${maxAttempts} — status: ${s.status}`);
    await new Promise(r => setTimeout(r, 3000));
  }

  // Auto-cancel stale order before throwing (per GOAT production checklist)
  await cancelOrder(orderId);
  throw new Error('Payment confirmation timeout — order cancelled');
}

module.exports = {
  createResearchOrder,
  pollUntilConfirmed,
  getProof,
  cancelOrder,
};