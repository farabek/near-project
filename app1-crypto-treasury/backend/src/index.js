const express = require('express');
const nearAPI = require('near-api-js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { config, validateConfig } = require('./config');
const { loadAccount, getNEARBalance, getUSDCBalance } = require('./wallet');
const { wrapNEAR, swapNEARtoUSDC } = require('./swap');
const { lockFunds, releaseFunds, getPayment, getAllPayments } = require('./escrow');

validateConfig();

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

let account;

async function initAccount() {
  account = await loadAccount(config);
}

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== config.releaseApiKey) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  }
  next();
}

// ─── GET /api/balance ────────────────────────────────────────────────────────
// Возвращает NEAR баланс аккаунта
app.get('/api/balance', async (req, res) => {
  try {
    const [near, usdc] = await Promise.all([
      getNEARBalance(account),
      getUSDCBalance(account),
    ]);
    res.json({ near: near.near, yocto: near.yocto, usdc: usdc.usdc, usdcRaw: usdc.raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/swap ──────────────────────────────────────────────────────────
// Конвертирует NEAR → USDC через Ref Finance
// Body: { amountNEAR: "1.5", minAmountOut: "0" }
app.post('/api/swap', requireApiKey, async (req, res) => {
  const { amountNEAR, minAmountOut } = req.body;
  if (!amountNEAR || minAmountOut == null) {
    return res.status(400).json({ error: 'amountNEAR and minAmountOut are required' });
  }

  try {
    const amountYocto = nearAPI.utils.format.parseNearAmount(amountNEAR);
    await wrapNEAR(account, amountYocto);
    await swapNEARtoUSDC(account, amountYocto, minAmountOut);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/lock ──────────────────────────────────────────────────────────
// Блокирует USDC в эскроу-контракте
// Body: { paymentId: "pay_001", amountUsdc: 100000000 }
app.post('/api/lock', requireApiKey, async (req, res) => {
  const { paymentId, amountUsdc } = req.body;
  if (!paymentId || amountUsdc == null) {
    return res.status(400).json({ error: 'paymentId and amountUsdc are required' });
  }

  try {
    await lockFunds(account, config.contractId, paymentId, amountUsdc);
    res.json({ success: true, paymentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/release ───────────────────────────────────────────────────────
// Разблокирует USDC — вызывается из App 2 после подтверждения выплаты школе
// Body: { paymentId: "pay_001" }
// Header: x-api-key: <RELEASE_API_KEY>
app.post('/api/release', requireApiKey, async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  try {
    await releaseFunds(account, config.contractId, paymentId);
    res.json({ success: true, paymentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payments ───────────────────────────────────────────────────────
// Возвращает историю всех платежей
app.get('/api/payments', async (req, res) => {
  try {
    const payments = await getAllPayments(account, config.contractId);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payments/:id ───────────────────────────────────────────────────
// Возвращает один платёж по ID
app.get('/api/payments/:id', async (req, res) => {
  try {
    const payment = await getPayment(account, config.contractId, req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start server (только при прямом запуске, не при тестах) ─────────────────
if (require.main === module) {
  initAccount().then(() => {
    app.listen(config.port, () => {
      console.log(`App 1 Crypto Treasury running on port ${config.port}`);
      console.log(`  NEAR account: ${config.accountId}`);
      console.log(`  Contract:     ${config.contractId}`);
      console.log(`  Network:      ${config.networkId}`);
    });
  }).catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
}

app.initAccount = initAccount;
module.exports = app;
