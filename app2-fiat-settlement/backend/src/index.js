const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { config, validateConfig } = require('./config');
const {
  initDb,
  addSchool, getSchool, getAllSchools, updateSchool, deleteSchool,
  createPayment, getPayment, getAllPayments, confirmPayment,
  createSchedule, getSchedule, getAllSchedules, toggleSchedule, deleteSchedule,
} = require('./db');
const { mockSendPayment, releaseApp1 } = require('./payment');
const { startScheduler, registerSchedule, unregisterSchedule, stopAllSchedules } = require('./scheduler');

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, '../public')));

let db;

function requireAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== config.adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  }
  next();
}

function initApp(dbPath) {
  db = initDb(dbPath || config.dbPath);
  return app;
}

function closeDb() {
  stopAllSchedules();
  if (db) {
    db.close();
    db = null;
  }
}

// ─── Schools ──────────────────────────────────────────────────────────────────

app.get('/api/schools', (req, res) => {
  res.json(getAllSchools(db));
});

app.post('/api/schools', requireAuth, (req, res) => {
  const { name, bank_details, currency } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    res.status(201).json(addSchool(db, { name, bank_details, currency }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/schools/:id', requireAuth, (req, res) => {
  const school = getSchool(db, req.params.id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  try {
    res.json(updateSchool(db, req.params.id, req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/schools/:id', requireAuth, (req, res) => {
  const school = getSchool(db, req.params.id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  try {
    deleteSchool(db, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Payments ─────────────────────────────────────────────────────────────────

app.get('/api/payments', (req, res) => {
  res.json(getAllPayments(db));
});

app.post('/api/payments', requireAuth, (req, res) => {
  const { school_id, app1_payment_id, amount, currency, notes } = req.body;
  const parsedAmount = Number(amount);
  if (!school_id || amount == null || isNaN(parsedAmount) || parsedAmount <= 0 || !Number.isInteger(parsedAmount)) {
    return res.status(400).json({ error: 'school_id and amount (positive integer) are required' });
  }
  const school = getSchool(db, school_id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  try {
    res.status(201).json(createPayment(db, { school_id, app1_payment_id, amount, currency, notes }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments/:id/confirm', requireAuth, async (req, res) => {
  const payment = getPayment(db, req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const locked = db.prepare(
    "UPDATE payments SET status='processing' WHERE id=? AND status='pending'"
  ).run(req.params.id);
  if (locked.changes === 0) {
    return res.status(400).json({ error: 'Payment already sent or in progress' });
  }

  try {
    const school = getSchool(db, payment.school_id);
    await mockSendPayment({ school, amount: payment.amount, currency: payment.currency });

    let app1Released = false;
    let warning = null;

    if (payment.app1_payment_id) {
      try {
        await releaseApp1(config.app1Url, config.app1ApiKey, payment.app1_payment_id);
        app1Released = true;
      } catch (err) {
        warning = `App 1 release failed: ${err.message}`;
      }
    }

    const updated = confirmPayment(db, payment.id, { app1_released: app1Released });
    const response = { success: true, payment: updated };
    if (warning) response.warning = warning;
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Schedules ────────────────────────────────────────────────────────────────

app.get('/api/schedules', (req, res) => {
  res.json(getAllSchedules(db));
});

app.post('/api/schedules', requireAuth, (req, res) => {
  const { school_id, app1_payment_id, amount, currency, cron_expr } = req.body;
  const parsedAmount = Number(amount);
  if (!school_id || amount == null || isNaN(parsedAmount) || parsedAmount <= 0 || !Number.isInteger(parsedAmount) || !cron_expr) {
    return res.status(400).json({ error: 'school_id, amount (positive integer), and cron_expr are required' });
  }
  if (!require('node-cron').validate(cron_expr)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }
  const school = getSchool(db, school_id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  try {
    const schedule = createSchedule(db, { school_id, app1_payment_id, amount, currency, cron_expr });
    registerSchedule(db, config, schedule);
    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/schedules/:id', requireAuth, (req, res) => {
  const schedule = getSchedule(db, req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  const { active } = req.body;
  if (active === undefined) return res.status(400).json({ error: 'active is required' });
  try {
    if (!active) unregisterSchedule(schedule.id);
    else registerSchedule(db, config, schedule);
    res.json(toggleSchedule(db, req.params.id, active));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/schedules/:id', requireAuth, (req, res) => {
  const schedule = getSchedule(db, req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  try {
    unregisterSchedule(schedule.id);
    deleteSchedule(db, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  validateConfig();
  initApp();
  startScheduler(db, config);
  app.listen(config.port, () => {
    console.log(`App 2 Fiat Settlement running on port ${config.port}`);
    console.log(`  App 1 URL: ${config.app1Url}`);
    console.log(`  DB:        ${config.dbPath}`);
  });
}

app.initApp = initApp;
app.closeDb = closeDb;
module.exports = app;
