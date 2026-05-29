# App 2: Fiat Settlement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build App 2 — a Node.js/Express backend with vanilla HTML/JS frontend that lets the owner manage schools, create fiat payments with mock provider, and signal App 1 to release USDC escrow.

**Architecture:** Express server on port 3001 serves both REST API and static HTML pages. SQLite (via better-sqlite3) stores schools, payments, and schedules. A mock payment module always returns success; real provider can replace it later. A node-cron scheduler fires recurring payments automatically.

**Tech Stack:** Node.js, Express 4, better-sqlite3, node-cron, Jest, supertest, vanilla HTML/JS

---

## File Map

| File | Responsibility |
|------|----------------|
| `app2-fiat-settlement/backend/src/config.js` | Read env vars, validateConfig() |
| `app2-fiat-settlement/backend/src/db.js` | initDb() + all CRUD for schools/payments/schedules |
| `app2-fiat-settlement/backend/src/payment.js` | mockSendPayment() + releaseApp1() |
| `app2-fiat-settlement/backend/src/scheduler.js` | startScheduler(), register/unregisterSchedule(), runScheduledPayment() |
| `app2-fiat-settlement/backend/src/index.js` | Express server + all 11 API routes |
| `app2-fiat-settlement/backend/public/index.html` | Owner dashboard |
| `app2-fiat-settlement/backend/public/schools.html` | School management |
| `app2-fiat-settlement/backend/public/payments.html` | Payment creation and history |
| `app2-fiat-settlement/backend/public/schedules.html` | Schedule management |
| `app2-fiat-settlement/backend/tests/db.test.js` | 6 db unit tests |
| `app2-fiat-settlement/backend/tests/payment.test.js` | 5 payment unit tests |
| `app2-fiat-settlement/backend/tests/scheduler.test.js` | 4 scheduler unit tests |
| `app2-fiat-settlement/backend/tests/api.test.js` | 8 API integration tests |
| `app2-fiat-settlement/backend/package.json` | Dependencies |
| `app2-fiat-settlement/backend/jest.config.js` | Jest config |
| `app2-fiat-settlement/backend/.env.example` | Env template |
| `app2-fiat-settlement/.env` | Real env vars (never commit) |

---

## Task 1: Project Scaffold

**Files:**

- Create: `app2-fiat-settlement/backend/package.json`
- Create: `app2-fiat-settlement/backend/jest.config.js`
- Create: `app2-fiat-settlement/backend/src/config.js`
- Create: `app2-fiat-settlement/backend/.env.example`
- Create: `app2-fiat-settlement/.env`

- [ ] **Step 1: Create directory structure**

```powershell
New-Item -ItemType Directory -Force -Path "E:\near_project\app2-fiat-settlement\backend\src"
New-Item -ItemType Directory -Force -Path "E:\near_project\app2-fiat-settlement\backend\public"
New-Item -ItemType Directory -Force -Path "E:\near_project\app2-fiat-settlement\backend\tests"
New-Item -ItemType Directory -Force -Path "E:\near_project\app2-fiat-settlement\backend\data"
```

- [ ] **Step 2: Create `backend/package.json`**

```json
{
  "name": "app2-fiat-settlement",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.4"
  }
}
```

- [ ] **Step 3: Create `backend/jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
};
```

- [ ] **Step 4: Create `backend/src/config.js`**

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  app1Url: process.env.APP1_URL || 'http://localhost:3000',
  app1ApiKey: process.env.APP1_RELEASE_API_KEY || '',
  dbPath: process.env.DB_PATH || require('path').join(__dirname, '../../data/app2.db'),
};

function validateConfig() {
  if (!config.app1ApiKey) {
    throw new Error('APP1_RELEASE_API_KEY is required. Check your .env file.');
  }
}

module.exports = { config, validateConfig };
```

- [ ] **Step 5: Create `backend/.env.example`**

```
PORT=3001
APP1_URL=http://localhost:3000
APP1_RELEASE_API_KEY=your_api_key_here
DB_PATH=./data/app2.db
```

- [ ] **Step 6: Create `app2-fiat-settlement/.env`**

Copy `.env.example` to `app2-fiat-settlement/.env` and fill in the real `APP1_RELEASE_API_KEY` — this is the same key as `RELEASE_API_KEY` in App 1 (see `E:\near_project\app1-crypto-treasury\backend\.env`).

```
PORT=3001
APP1_URL=http://localhost:3000
APP1_RELEASE_API_KEY=<copy RELEASE_API_KEY value from App 1>
DB_PATH=./data/app2.db
```

- [ ] **Step 7: Install dependencies**

```powershell
cd E:\near_project\app2-fiat-settlement\backend
npm install
```

Expected: `node_modules` created, no errors.

---

## Task 2: Database Module (TDD)

**Files:**

- Create: `backend/src/db.js`
- Create: `backend/tests/db.test.js`

- [ ] **Step 1: Write failing tests — `backend/tests/db.test.js`**

```js
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/test-db.db');

let db;
let dbModule;

beforeEach(() => {
  dbModule = require('../src/db');
  db = dbModule.initDb(TEST_DB);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  jest.resetModules();
});

describe('schools', () => {
  test('addSchool creates record with correct fields', () => {
    const school = dbModule.addSchool(db, { name: 'Test School', bank_details: 'IBAN123', currency: 'USD' });
    expect(school.id).toBeDefined();
    expect(school.name).toBe('Test School');
    expect(school.bank_details).toBe('IBAN123');
    expect(school.currency).toBe('USD');
  });

  test('getAllSchools returns all schools', () => {
    dbModule.addSchool(db, { name: 'School A', currency: 'USD' });
    dbModule.addSchool(db, { name: 'School B', currency: 'RUB' });
    expect(dbModule.getAllSchools(db)).toHaveLength(2);
  });

  test('deleteSchool throws if school has payments', () => {
    const school = dbModule.addSchool(db, { name: 'School', currency: 'USD' });
    dbModule.createPayment(db, { school_id: school.id, amount: 100, currency: 'USD' });
    expect(() => dbModule.deleteSchool(db, school.id)).toThrow('School has existing payments');
  });
});

describe('payments', () => {
  let school;
  beforeEach(() => {
    school = dbModule.addSchool(db, { name: 'Test School', currency: 'USD' });
  });

  test('createPayment defaults status to pending and app1_released to 0', () => {
    const payment = dbModule.createPayment(db, { school_id: school.id, amount: 200, currency: 'USD' });
    expect(payment.status).toBe('pending');
    expect(payment.app1_released).toBe(0);
    expect(payment.sent_at).toBeNull();
  });

  test('confirmPayment sets status to sent and records sent_at', () => {
    const payment = dbModule.createPayment(db, { school_id: school.id, amount: 200, currency: 'USD' });
    const confirmed = dbModule.confirmPayment(db, payment.id, { app1_released: true });
    expect(confirmed.status).toBe('sent');
    expect(confirmed.app1_released).toBe(1);
    expect(confirmed.sent_at).toBeTruthy();
  });
});

describe('schedules', () => {
  let school;
  beforeEach(() => {
    school = dbModule.addSchool(db, { name: 'Test School', currency: 'USD' });
  });

  test('createSchedule defaults active to 1', () => {
    const schedule = dbModule.createSchedule(db, {
      school_id: school.id, amount: 300, currency: 'USD', cron_expr: '0 9 1 * *',
    });
    expect(schedule.active).toBe(1);
    expect(schedule.cron_expr).toBe('0 9 1 * *');
  });

  test('toggleSchedule pauses and reactivates', () => {
    const schedule = dbModule.createSchedule(db, {
      school_id: school.id, amount: 300, currency: 'USD', cron_expr: '0 9 1 * *',
    });
    const paused = dbModule.toggleSchedule(db, schedule.id, false);
    expect(paused.active).toBe(0);
    const active = dbModule.toggleSchedule(db, schedule.id, true);
    expect(active.active).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
cd E:\near_project\app2-fiat-settlement\backend
npx jest tests/db.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/db'`

- [ ] **Step 3: Create `backend/src/db.js`**

```js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function initDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      bank_details TEXT,
      currency     TEXT NOT NULL DEFAULT 'USD',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id        INTEGER NOT NULL REFERENCES schools(id),
      app1_payment_id  TEXT,
      amount           REAL NOT NULL,
      currency         TEXT NOT NULL DEFAULT 'USD',
      status           TEXT NOT NULL DEFAULT 'pending',
      app1_released    INTEGER NOT NULL DEFAULT 0,
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id  INTEGER NOT NULL REFERENCES schools(id),
      amount     REAL NOT NULL,
      currency   TEXT NOT NULL DEFAULT 'USD',
      cron_expr  TEXT NOT NULL,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

// ─── Schools ──────────────────────────────────────────────────────────────────

function addSchool(db, { name, bank_details, currency = 'USD' }) {
  const result = db.prepare(
    'INSERT INTO schools (name, bank_details, currency) VALUES (?, ?, ?)'
  ).run(name, bank_details || null, currency);
  return getSchool(db, result.lastInsertRowid);
}

function getSchool(db, id) {
  return db.prepare('SELECT * FROM schools WHERE id = ?').get(id) || null;
}

function getAllSchools(db) {
  return db.prepare('SELECT * FROM schools ORDER BY created_at DESC').all();
}

function updateSchool(db, id, { name, bank_details, currency }) {
  db.prepare(`
    UPDATE schools
    SET name = COALESCE(?, name),
        bank_details = COALESCE(?, bank_details),
        currency = COALESCE(?, currency)
    WHERE id = ?
  `).run(name || null, bank_details || null, currency || null, id);
  return getSchool(db, id);
}

function deleteSchool(db, id) {
  const count = db.prepare('SELECT COUNT(*) as c FROM payments WHERE school_id = ?').get(id).c;
  if (count > 0) throw new Error('School has existing payments');
  db.prepare('DELETE FROM schools WHERE id = ?').run(id);
}

// ─── Payments ─────────────────────────────────────────────────────────────────

function createPayment(db, { school_id, app1_payment_id, amount, currency = 'USD', notes }) {
  const result = db.prepare(
    'INSERT INTO payments (school_id, app1_payment_id, amount, currency, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(school_id, app1_payment_id || null, amount, currency, notes || null);
  return getPayment(db, result.lastInsertRowid);
}

function getPayment(db, id) {
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id) || null;
}

function getAllPayments(db) {
  return db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all();
}

function confirmPayment(db, id, { app1_released }) {
  db.prepare(`
    UPDATE payments
    SET status = 'sent', sent_at = datetime('now'), app1_released = ?
    WHERE id = ?
  `).run(app1_released ? 1 : 0, id);
  return getPayment(db, id);
}

// ─── Schedules ────────────────────────────────────────────────────────────────

function createSchedule(db, { school_id, amount, currency = 'USD', cron_expr }) {
  const result = db.prepare(
    'INSERT INTO schedules (school_id, amount, currency, cron_expr) VALUES (?, ?, ?, ?)'
  ).run(school_id, amount, currency, cron_expr);
  return getSchedule(db, result.lastInsertRowid);
}

function getSchedule(db, id) {
  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) || null;
}

function getAllSchedules(db) {
  return db.prepare('SELECT * FROM schedules ORDER BY created_at DESC').all();
}

function toggleSchedule(db, id, active) {
  db.prepare('UPDATE schedules SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  return getSchedule(db, id);
}

function deleteSchedule(db, id) {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

module.exports = {
  initDb,
  addSchool, getSchool, getAllSchools, updateSchool, deleteSchool,
  createPayment, getPayment, getAllPayments, confirmPayment,
  createSchedule, getSchedule, getAllSchedules, toggleSchedule, deleteSchedule,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
cd E:\near_project\app2-fiat-settlement\backend
npx jest tests/db.test.js --no-coverage
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```powershell
cd E:\near_project
git init
git add app2-fiat-settlement/backend/src/db.js app2-fiat-settlement/backend/tests/db.test.js app2-fiat-settlement/backend/package.json app2-fiat-settlement/backend/jest.config.js app2-fiat-settlement/backend/src/config.js app2-fiat-settlement/backend/.env.example
git commit -m "feat: app2 scaffold + db module (6 tests)"
```

---

## Task 3: Payment Module (TDD)

**Files:**

- Create: `backend/src/payment.js`
- Create: `backend/tests/payment.test.js`

- [ ] **Step 1: Write failing tests — `backend/tests/payment.test.js`**

```js
const http = require('http');

// Must set env before requiring module
process.env.APP1_RELEASE_API_KEY = 'test-key';

const { mockSendPayment, releaseApp1 } = require('../src/payment');

describe('mockSendPayment', () => {
  test('always resolves with success and a ref string', async () => {
    const result = await mockSendPayment({ amount: 100, currency: 'USD' });
    expect(result.success).toBe(true);
    expect(typeof result.ref).toBe('string');
    expect(result.ref.length).toBeGreaterThan(0);
  });

  test('works with any currency', async () => {
    const result = await mockSendPayment({ amount: 500, currency: 'RUB' });
    expect(result.success).toBe(true);
  });
});

describe('releaseApp1', () => {
  let server;
  let lastRequest;

  beforeEach((done) => {
    lastRequest = null;
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        lastRequest = { method: req.method, headers: req.headers, body: JSON.parse(body) };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, paymentId: JSON.parse(body).paymentId }));
      });
    });
    server.listen(0, done);
  });

  afterEach((done) => server.close(done));

  test('sends POST /api/release with correct paymentId and x-api-key', async () => {
    const port = server.address().port;
    const result = await releaseApp1(`http://localhost:${port}`, 'test-key', 'pay_001');
    expect(result.success).toBe(true);
    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.headers['x-api-key']).toBe('test-key');
    expect(lastRequest.body.paymentId).toBe('pay_001');
  });

  test('rejects when server returns non-200', async () => {
    const badServer = http.createServer((req, res) => {
      res.writeHead(401);
      res.end('Unauthorized');
    });
    await new Promise((done) => badServer.listen(0, done));
    const port = badServer.address().port;
    await expect(releaseApp1(`http://localhost:${port}`, 'bad-key', 'pay_001'))
      .rejects.toThrow('App 1 returned 401');
    await new Promise((done) => badServer.close(done));
  });

  test('rejects when server is unreachable', async () => {
    await expect(releaseApp1('http://localhost:19999', 'key', 'pay_001'))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest tests/payment.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/payment'`

- [ ] **Step 3: Create `backend/src/payment.js`**

```js
const http = require('http');

function mockSendPayment({ amount, currency }) {
  return Promise.resolve({ success: true, ref: `mock_${Date.now()}_${Math.random().toString(36).slice(2)}` });
}

function releaseApp1(app1Url, apiKey, paymentId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ paymentId });
    const url = new URL(`${app1Url}/api/release`);
    const options = {
      hostname: url.hostname,
      port: Number(url.port) || 80,
      path: '/api/release',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': apiKey,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`App 1 returned ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { mockSendPayment, releaseApp1 };
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest tests/payment.test.js --no-coverage
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```powershell
cd E:\near_project
git add app2-fiat-settlement/backend/src/payment.js app2-fiat-settlement/backend/tests/payment.test.js
git commit -m "feat: payment module — mock provider + App 1 release (5 tests)"
```

---

## Task 4: Scheduler Module (TDD)

**Files:**

- Create: `backend/src/scheduler.js`
- Create: `backend/tests/scheduler.test.js`

- [ ] **Step 1: Write failing tests — `backend/tests/scheduler.test.js`**

```js
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/scheduler-test.db');

let db;
let dbModule;
let schedulerModule;

beforeEach(() => {
  jest.resetModules();
  dbModule = require('../src/db');
  schedulerModule = require('../src/scheduler');
  db = dbModule.initDb(TEST_DB);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

const testConfig = { app1Url: 'http://localhost:3099', app1ApiKey: 'test' };

describe('runScheduledPayment', () => {
  test('creates payment and confirms it with status sent', async () => {
    const school = dbModule.addSchool(db, { name: 'School', currency: 'USD' });
    const schedule = { id: 1, school_id: school.id, amount: 150, currency: 'EUR' };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    const payments = dbModule.getAllPayments(db);
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('sent');
    expect(payments[0].amount).toBe(150);
    expect(payments[0].currency).toBe('EUR');
    expect(payments[0].app1_released).toBe(0);
    expect(payments[0].app1_payment_id).toBeNull();
  });

  test('records sent_at timestamp after running', async () => {
    const school = dbModule.addSchool(db, { name: 'School', currency: 'USD' });
    const schedule = { id: 1, school_id: school.id, amount: 100, currency: 'USD' };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    const payments = dbModule.getAllPayments(db);
    expect(payments[0].sent_at).toBeTruthy();
  });
});

describe('registerSchedule / unregisterSchedule', () => {
  test('registers a schedule without throwing', () => {
    const schedule = { id: 99, school_id: 1, amount: 100, currency: 'USD', cron_expr: '0 9 1 * *' };
    expect(() => schedulerModule.registerSchedule(db, testConfig, schedule)).not.toThrow();
    schedulerModule.unregisterSchedule(99);
  });

  test('unregistering a non-existent schedule does not throw', () => {
    expect(() => schedulerModule.unregisterSchedule(9999)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest tests/scheduler.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/scheduler'`

- [ ] **Step 3: Create `backend/src/scheduler.js`**

```js
const cron = require('node-cron');
const { getAllSchedules, createPayment, confirmPayment } = require('./db');
const { mockSendPayment } = require('./payment');

const activeTasks = new Map();

function startScheduler(db, config) {
  const schedules = getAllSchedules(db).filter((s) => s.active);
  for (const schedule of schedules) {
    registerSchedule(db, config, schedule);
  }
}

function registerSchedule(db, config, schedule) {
  if (activeTasks.has(schedule.id)) return;

  const task = cron.schedule(schedule.cron_expr, async () => {
    try {
      await runScheduledPayment(db, config, schedule);
    } catch (err) {
      console.error(`Scheduler error for schedule ${schedule.id}:`, err.message);
    }
  });

  activeTasks.set(schedule.id, task);
}

function unregisterSchedule(id) {
  const task = activeTasks.get(id);
  if (task) {
    task.stop();
    activeTasks.delete(id);
  }
}

async function runScheduledPayment(db, config, schedule) {
  const payment = createPayment(db, {
    school_id: schedule.school_id,
    amount: schedule.amount,
    currency: schedule.currency,
  });

  await mockSendPayment({ amount: schedule.amount, currency: schedule.currency });

  confirmPayment(db, payment.id, { app1_released: false });
  return payment;
}

module.exports = { startScheduler, registerSchedule, unregisterSchedule, runScheduledPayment };
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest tests/scheduler.test.js --no-coverage
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```powershell
cd E:\near_project
git add app2-fiat-settlement/backend/src/scheduler.js app2-fiat-settlement/backend/tests/scheduler.test.js
git commit -m "feat: scheduler module — cron-based auto payments (4 tests)"
```

---

## Task 5: Express API (TDD)

**Files:**

- Create: `backend/src/index.js`
- Create: `backend/tests/api.test.js`

- [ ] **Step 1: Write failing tests — `backend/tests/api.test.js`**

```js
// Must set env before requiring any module that reads config
process.env.APP1_RELEASE_API_KEY = 'test-key';
process.env.APP1_URL = 'http://localhost:3099'; // nothing running — tests App 1 failure path
process.env.PORT = '3002';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/api-test.db');

let app;

beforeAll(() => {
  app = require('../src/index');
  app.initApp(TEST_DB);
});

afterAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('GET /api/schools', () => {
  test('returns empty array initially', async () => {
    const res = await request(app).get('/api/schools');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/schools', () => {
  test('creates a school and returns it', async () => {
    const res = await request(app)
      .post('/api/schools')
      .send({ name: 'Test School', bank_details: 'IBAN001', currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test School');
    expect(res.body.id).toBeDefined();
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/schools').send({ currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });
});

describe('POST /api/payments', () => {
  let schoolId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/schools')
      .send({ name: 'Payment Test School', currency: 'USD' });
    schoolId = res.body.id;
  });

  test('creates a payment with status pending', async () => {
    const res = await request(app)
      .post('/api/payments')
      .send({ school_id: schoolId, amount: 200, currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.amount).toBe(200);
  });

  test('returns 400 when amount is missing', async () => {
    const res = await request(app)
      .post('/api/payments')
      .send({ school_id: schoolId });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payments/:id/confirm', () => {
  let paymentId;
  let schoolId;

  beforeAll(async () => {
    const schoolRes = await request(app)
      .post('/api/schools')
      .send({ name: 'Confirm Test School', currency: 'USD' });
    schoolId = schoolRes.body.id;

    const paymentRes = await request(app)
      .post('/api/payments')
      .send({ school_id: schoolId, amount: 300, currency: 'USD' });
    paymentId = paymentRes.body.id;
  });

  test('confirms payment, sets status to sent', async () => {
    const res = await request(app).post(`/api/payments/${paymentId}/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment.status).toBe('sent');
  });

  test('returns 400 on double confirm', async () => {
    const res = await request(app).post(`/api/payments/${paymentId}/confirm`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already sent/i);
  });
});

describe('DELETE /api/schools/:id', () => {
  test('returns 400 when school has payments', async () => {
    const schoolRes = await request(app)
      .post('/api/schools')
      .send({ name: 'School With Payments', currency: 'USD' });
    await request(app)
      .post('/api/payments')
      .send({ school_id: schoolRes.body.id, amount: 50, currency: 'USD' });

    const res = await request(app).delete(`/api/schools/${schoolRes.body.id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/existing payments/i);
  });
});

describe('Schedules API', () => {
  let schoolId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/schools')
      .send({ name: 'Schedule School', currency: 'USD' });
    schoolId = res.body.id;
  });

  test('creates a schedule and returns it active', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({ school_id: schoolId, amount: 100, currency: 'USD', cron_expr: '0 9 1 * *' });
    expect(res.status).toBe(201);
    expect(res.body.active).toBe(1);
    expect(res.body.cron_expr).toBe('0 9 1 * *');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest tests/api.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/index'`

- [ ] **Step 3: Create `backend/src/index.js`**

```js
const express = require('express');
const path = require('path');
const { config, validateConfig } = require('./config');
const {
  initDb,
  addSchool, getSchool, getAllSchools, updateSchool, deleteSchool,
  createPayment, getPayment, getAllPayments, confirmPayment,
  createSchedule, getSchedule, getAllSchedules, toggleSchedule, deleteSchedule,
} = require('./db');
const { mockSendPayment, releaseApp1 } = require('./payment');
const { startScheduler, registerSchedule, unregisterSchedule } = require('./scheduler');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let db;

function initApp(dbPath) {
  db = initDb(dbPath || config.dbPath);
  return app;
}

// ─── Schools ──────────────────────────────────────────────────────────────────

app.get('/api/schools', (req, res) => {
  res.json(getAllSchools(db));
});

app.post('/api/schools', (req, res) => {
  const { name, bank_details, currency } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    res.status(201).json(addSchool(db, { name, bank_details, currency }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/schools/:id', (req, res) => {
  const school = getSchool(db, req.params.id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  res.json(updateSchool(db, req.params.id, req.body));
});

app.delete('/api/schools/:id', (req, res) => {
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

app.post('/api/payments', (req, res) => {
  const { school_id, app1_payment_id, amount, currency, notes } = req.body;
  if (!school_id || amount == null) {
    return res.status(400).json({ error: 'school_id and amount are required' });
  }
  const school = getSchool(db, school_id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  res.status(201).json(createPayment(db, { school_id, app1_payment_id, amount, currency, notes }));
});

app.post('/api/payments/:id/confirm', async (req, res) => {
  const payment = getPayment(db, req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status === 'sent') return res.status(400).json({ error: 'Payment already sent' });

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

app.post('/api/schedules', (req, res) => {
  const { school_id, amount, currency, cron_expr } = req.body;
  if (!school_id || amount == null || !cron_expr) {
    return res.status(400).json({ error: 'school_id, amount, and cron_expr are required' });
  }
  const school = getSchool(db, school_id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  const schedule = createSchedule(db, { school_id, amount, currency, cron_expr });
  registerSchedule(db, config, schedule);
  res.status(201).json(schedule);
});

app.patch('/api/schedules/:id', (req, res) => {
  const schedule = getSchedule(db, req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  const { active } = req.body;
  if (active === undefined) return res.status(400).json({ error: 'active is required' });
  if (!active) unregisterSchedule(schedule.id);
  else registerSchedule(db, config, schedule);
  res.json(toggleSchedule(db, req.params.id, active));
});

app.delete('/api/schedules/:id', (req, res) => {
  const schedule = getSchedule(db, req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  unregisterSchedule(schedule.id);
  deleteSchedule(db, req.params.id);
  res.json({ success: true });
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
module.exports = app;
```

- [ ] **Step 4: Run all tests**

```powershell
npx jest --no-coverage --runInBand
```

Expected: `23 passed` (6 db + 5 payment + 4 scheduler + 8 api)

- [ ] **Step 5: Commit**

```powershell
cd E:\near_project
git add app2-fiat-settlement/backend/src/index.js app2-fiat-settlement/backend/tests/api.test.js
git commit -m "feat: express API — 11 endpoints, all 23 tests passing"
```

---

## Task 6: Dashboard HTML

**Files:**

- Create: `backend/public/index.html`

- [ ] **Step 1: Create `backend/public/index.html`**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>App 2 — Дашборд</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
    nav { background: #1e40af; color: white; padding: 14px 24px; display: flex; gap: 24px; align-items: center; }
    nav a { color: white; text-decoration: none; font-size: 14px; opacity: 0.8; }
    nav a:hover, nav a.active { opacity: 1; font-weight: 600; }
    nav .brand { font-weight: 700; font-size: 16px; margin-right: 16px; opacity: 1; }
    .container { max-width: 1000px; margin: 32px auto; padding: 0 24px; }
    h1 { font-size: 22px; margin-bottom: 24px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
    .card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card .label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
    .card .value { font-size: 28px; font-weight: 700; }
    .card .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
    th { text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
    .badge { padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .badge.sent { background: #dcfce7; color: #16a34a; }
    .badge.pending { background: #dbeafe; color: #1d4ed8; }
    .actions { display: flex; gap: 12px; margin-bottom: 24px; }
    .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; }
    .btn-primary { background: #1e40af; color: white; }
    .btn-secondary { background: white; color: #1e293b; border: 1px solid #e2e8f0; }
    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
  </style>
</head>
<body>
  <nav>
    <span class="brand">💰 Edu-Arbitrage</span>
    <a href="/" class="active">Дашборд</a>
    <a href="/schools.html">Школы</a>
    <a href="/payments.html">Выплаты</a>
    <a href="/schedules.html">Расписания</a>
  </nav>
  <div class="container">
    <h1>Дашборд</h1>
    <div class="stats">
      <div class="card">
        <div class="label">Выплачено (этот месяц)</div>
        <div class="value" id="monthlyTotal">—</div>
        <div class="sub" id="monthlyCount">загрузка...</div>
      </div>
      <div class="card">
        <div class="label">Ожидают подтверждения</div>
        <div class="value" id="pendingCount">—</div>
        <div class="sub">pending платежей</div>
      </div>
      <div class="card">
        <div class="label">Школ в системе</div>
        <div class="value" id="schoolCount">—</div>
        <div class="sub" id="scheduleCount">загрузка...</div>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" onclick="location.href='/payments.html'">+ Новая выплата</button>
      <button class="btn btn-secondary" onclick="location.href='/schools.html'">Управление школами</button>
    </div>
    <div class="section-title">Последние выплаты</div>
    <table>
      <thead><tr><th>Школа</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr></thead>
      <tbody id="paymentsTable"><tr><td colspan="4">Загрузка...</td></tr></tbody>
    </table>
  </div>
  <script>
    async function load() {
      const [paymentsRes, schoolsRes, schedulesRes] = await Promise.all([
        fetch('/api/payments').then(r => r.json()),
        fetch('/api/schools').then(r => r.json()),
        fetch('/api/schedules').then(r => r.json()),
      ]);

      const now = new Date();
      const thisMonth = paymentsRes.filter(p => {
        const d = new Date(p.created_at);
        return p.status === 'sent' && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
      const monthlyTotal = thisMonth.reduce((sum, p) => sum + p.amount, 0);
      const pendingPayments = paymentsRes.filter(p => p.status === 'pending');

      document.getElementById('monthlyTotal').textContent = `$${monthlyTotal.toFixed(2)}`;
      document.getElementById('monthlyCount').textContent = `${thisMonth.length} выплат`;
      document.getElementById('pendingCount').textContent = pendingPayments.length;
      document.getElementById('schoolCount').textContent = schoolsRes.length;
      document.getElementById('scheduleCount').textContent = `${schedulesRes.filter(s => s.active).length} активных расписаний`;

      const schoolMap = {};
      schoolsRes.forEach(s => { schoolMap[s.id] = s.name; });

      const rows = paymentsRes.slice(0, 10).map(p => `
        <tr>
          <td>${schoolMap[p.school_id] || '—'}</td>
          <td>${p.amount} ${p.currency}</td>
          <td><span class="badge ${p.status}">${p.status}</span></td>
          <td>${p.created_at.slice(0, 10)}</td>
        </tr>
      `).join('');
      document.getElementById('paymentsTable').innerHTML = rows || '<tr><td colspan="4">Нет выплат</td></tr>';
    }
    load();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

```powershell
cd E:\near_project\app2-fiat-settlement\backend
node src/index.js
```

Open `http://localhost:3001` — should show dashboard with zeroes (no data yet).

- [ ] **Step 3: Commit**

```powershell
cd E:\near_project
git add app2-fiat-settlement/backend/public/index.html
git commit -m "feat: dashboard HTML — stats and recent payments"
```

---

## Task 7: Schools HTML

**Files:**

- Create: `backend/public/schools.html`

- [ ] **Step 1: Create `backend/public/schools.html`**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>App 2 — Школы</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
    nav { background: #1e40af; color: white; padding: 14px 24px; display: flex; gap: 24px; align-items: center; }
    nav a { color: white; text-decoration: none; font-size: 14px; opacity: 0.8; }
    nav a:hover, nav a.active { opacity: 1; font-weight: 600; }
    nav .brand { font-weight: 700; font-size: 16px; margin-right: 16px; opacity: 1; }
    .container { max-width: 1000px; margin: 32px auto; padding: 0 24px; }
    h1 { font-size: 22px; margin-bottom: 24px; }
    .layout { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    th { text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
    .card { background: white; border-radius: 10px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { font-size: 16px; margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px; margin-top: 12px; }
    input, select { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; }
    .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; margin-top: 16px; width: 100%; }
    .btn-primary { background: #1e40af; color: white; }
    .btn-danger { background: transparent; border: 1px solid #fca5a5; color: #dc2626; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
    .error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; padding: 10px 14px; border-radius: 6px; margin-top: 12px; font-size: 13px; display: none; }
    .success { background: #f0fdf4; border: 1px solid #86efac; color: #16a34a; padding: 10px 14px; border-radius: 6px; margin-top: 12px; font-size: 13px; display: none; }
  </style>
</head>
<body>
  <nav>
    <span class="brand">💰 Edu-Arbitrage</span>
    <a href="/">Дашборд</a>
    <a href="/schools.html" class="active">Школы</a>
    <a href="/payments.html">Выплаты</a>
    <a href="/schedules.html">Расписания</a>
  </nav>
  <div class="container">
    <h1>Школы</h1>
    <div class="layout">
      <table>
        <thead><tr><th>Название</th><th>Валюта</th><th>Реквизиты</th><th></th></tr></thead>
        <tbody id="schoolsTable"><tr><td colspan="4">Загрузка...</td></tr></tbody>
      </table>
      <div class="card">
        <h2>Добавить школу</h2>
        <label>Название *</label>
        <input id="name" placeholder="Школа №5" />
        <label>Валюта</label>
        <select id="currency">
          <option value="USD">USD</option>
          <option value="RUB">RUB</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="UZS">UZS</option>
        </select>
        <label>Банковские реквизиты</label>
        <input id="bank_details" placeholder="IBAN, номер счёта..." />
        <button class="btn btn-primary" onclick="addSchool()">Добавить</button>
        <div class="error" id="error"></div>
        <div class="success" id="success"></div>
      </div>
    </div>
  </div>
  <script>
    async function loadSchools() {
      const schools = await fetch('/api/schools').then(r => r.json());
      const rows = schools.map(s => `
        <tr>
          <td>${s.name}</td>
          <td>${s.currency}</td>
          <td style="color:#64748b;font-size:13px">${s.bank_details || '—'}</td>
          <td><button class="btn-danger" onclick="deleteSchool(${s.id}, '${s.name}')">Удалить</button></td>
        </tr>
      `).join('');
      document.getElementById('schoolsTable').innerHTML = rows || '<tr><td colspan="4">Нет школ</td></tr>';
    }

    async function addSchool() {
      const name = document.getElementById('name').value.trim();
      const currency = document.getElementById('currency').value;
      const bank_details = document.getElementById('bank_details').value.trim();
      const errEl = document.getElementById('error');
      const okEl = document.getElementById('success');
      errEl.style.display = 'none';
      okEl.style.display = 'none';

      if (!name) { errEl.textContent = 'Введите название'; errEl.style.display = 'block'; return; }

      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, currency, bank_details }),
      });
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }

      okEl.textContent = `Школа "${data.name}" добавлена`;
      okEl.style.display = 'block';
      document.getElementById('name').value = '';
      document.getElementById('bank_details').value = '';
      loadSchools();
    }

    async function deleteSchool(id, name) {
      if (!confirm(`Удалить "${name}"?`)) return;
      const res = await fetch(`/api/schools/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      loadSchools();
    }

    loadSchools();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3001/schools.html` — add a test school, verify it appears in the table.

- [ ] **Step 3: Commit**

```powershell
cd E:\near_project
git add app2-fiat-settlement/backend/public/schools.html
git commit -m "feat: schools HTML — add/list/delete schools"
```

---

## Task 8: Payments HTML

**Files:**

- Create: `backend/public/payments.html`

- [ ] **Step 1: Create `backend/public/payments.html`**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>App 2 — Выплаты</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
    nav { background: #1e40af; color: white; padding: 14px 24px; display: flex; gap: 24px; align-items: center; }
    nav a { color: white; text-decoration: none; font-size: 14px; opacity: 0.8; }
    nav a:hover, nav a.active { opacity: 1; font-weight: 600; }
    nav .brand { font-weight: 700; font-size: 16px; margin-right: 16px; opacity: 1; }
    .container { max-width: 1100px; margin: 32px auto; padding: 0 24px; }
    h1 { font-size: 22px; margin-bottom: 24px; }
    .layout { display: grid; grid-template-columns: 1fr 360px; gap: 24px; align-items: start; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    th { text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .badge { padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .badge.sent { background: #dcfce7; color: #16a34a; }
    .badge.pending { background: #dbeafe; color: #1d4ed8; }
    .card { background: white; border-radius: 10px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { font-size: 16px; margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px; margin-top: 12px; }
    input, select, textarea { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; }
    .row { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
    .btn { padding: 10px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn-primary { background: #1e40af; color: white; margin-top: 16px; width: 100%; }
    .btn-confirm { background: #16a34a; color: white; padding: 5px 12px; border-radius: 6px; cursor: pointer; border: none; font-size: 12px; }
    .error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; padding: 10px 14px; border-radius: 6px; margin-top: 12px; font-size: 13px; display: none; }
    .success { background: #f0fdf4; border: 1px solid #86efac; color: #16a34a; padding: 10px 14px; border-radius: 6px; margin-top: 12px; font-size: 13px; display: none; }
    .warn { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; padding: 10px 14px; border-radius: 6px; margin-top: 12px; font-size: 13px; display: none; }
    .hint { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  </style>
</head>
<body>
  <nav>
    <span class="brand">💰 Edu-Arbitrage</span>
    <a href="/">Дашборд</a>
    <a href="/schools.html">Школы</a>
    <a href="/payments.html" class="active">Выплаты</a>
    <a href="/schedules.html">Расписания</a>
  </nav>
  <div class="container">
    <h1>Выплаты</h1>
    <div class="layout">
      <table>
        <thead><tr><th>Школа</th><th>Сумма</th><th>App 1 ID</th><th>Статус</th><th>Дата</th><th></th></tr></thead>
        <tbody id="paymentsTable"><tr><td colspan="6">Загрузка...</td></tr></tbody>
      </table>
      <div class="card">
        <h2>Новая выплата</h2>
        <label>Школа *</label>
        <select id="school_id"></select>
        <label>Сумма и валюта *</label>
        <div class="row">
          <input id="amount" type="number" placeholder="300" min="0.01" step="0.01" />
          <select id="currency">
            <option>USD</option><option>RUB</option><option>EUR</option><option>GBP</option><option>UZS</option>
          </select>
        </div>
        <label>Payment ID из App 1</label>
        <input id="app1_payment_id" placeholder="pay_001" />
        <div class="hint">Необязательно. Если указан — App 1 разблокирует USDC при подтверждении.</div>
        <label>Заметка</label>
        <input id="notes" placeholder="За май 2026" />
        <button class="btn btn-primary" onclick="createPayment()">Создать выплату</button>
        <div class="error" id="error"></div>
        <div class="success" id="success"></div>
        <div class="warn" id="warn"></div>
      </div>
    </div>
  </div>
  <script>
    let schoolMap = {};

    async function loadData() {
      const [schools, payments] = await Promise.all([
        fetch('/api/schools').then(r => r.json()),
        fetch('/api/payments').then(r => r.json()),
      ]);

      schoolMap = {};
      schools.forEach(s => { schoolMap[s.id] = s.name; });

      const select = document.getElementById('school_id');
      select.innerHTML = schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

      const rows = payments.map(p => `
        <tr>
          <td>${schoolMap[p.school_id] || '—'}</td>
          <td>${p.amount} ${p.currency}</td>
          <td style="font-family:monospace;font-size:12px;color:#64748b">${p.app1_payment_id || '—'}</td>
          <td><span class="badge ${p.status}">${p.status}</span></td>
          <td>${p.created_at.slice(0, 10)}</td>
          <td>${p.status === 'pending' ? `<button class="btn-confirm" onclick="confirmPayment(${p.id})">✓ Отправить</button>` : ''}</td>
        </tr>
      `).join('');
      document.getElementById('paymentsTable').innerHTML = rows || '<tr><td colspan="6">Нет выплат</td></tr>';
    }

    async function createPayment() {
      const school_id = document.getElementById('school_id').value;
      const amount = parseFloat(document.getElementById('amount').value);
      const currency = document.getElementById('currency').value;
      const app1_payment_id = document.getElementById('app1_payment_id').value.trim() || null;
      const notes = document.getElementById('notes').value.trim() || null;
      const errEl = document.getElementById('error');
      const okEl = document.getElementById('success');
      errEl.style.display = 'none'; okEl.style.display = 'none';

      if (!school_id || !amount) { errEl.textContent = 'Выберите школу и введите сумму'; errEl.style.display = 'block'; return; }

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: parseInt(school_id), amount, currency, app1_payment_id, notes }),
      });
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }

      okEl.textContent = `Выплата создана (ID: ${data.id}). Нажмите "✓ Отправить" для подтверждения.`;
      okEl.style.display = 'block';
      document.getElementById('amount').value = '';
      document.getElementById('app1_payment_id').value = '';
      document.getElementById('notes').value = '';
      loadData();
    }

    async function confirmPayment(id) {
      const warnEl = document.getElementById('warn');
      warnEl.style.display = 'none';
      const res = await fetch(`/api/payments/${id}/confirm`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      if (data.warning) { warnEl.textContent = data.warning; warnEl.style.display = 'block'; }
      loadData();
    }

    loadData();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3001/payments.html` — create a payment, confirm it, verify status changes to `sent`.

- [ ] **Step 3: Commit**

```powershell
cd E:\near_project
git add app2-fiat-settlement/backend/public/payments.html
git commit -m "feat: payments HTML — create, confirm, history"
```

---

## Task 9: Schedules HTML

**Files:**

- Create: `backend/public/schedules.html`

- [ ] **Step 1: Create `backend/public/schedules.html`**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>App 2 — Расписания</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
    nav { background: #1e40af; color: white; padding: 14px 24px; display: flex; gap: 24px; align-items: center; }
    nav a { color: white; text-decoration: none; font-size: 14px; opacity: 0.8; }
    nav a:hover, nav a.active { opacity: 1; font-weight: 600; }
    nav .brand { font-weight: 700; font-size: 16px; margin-right: 16px; opacity: 1; }
    .container { max-width: 1000px; margin: 32px auto; padding: 0 24px; }
    h1 { font-size: 22px; margin-bottom: 24px; }
    .layout { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    th { text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .badge { padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .badge.active { background: #dcfce7; color: #16a34a; }
    .badge.paused { background: #f1f5f9; color: #64748b; }
    .card { background: white; border-radius: 10px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { font-size: 16px; margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px; margin-top: 12px; }
    input, select { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; }
    .row { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
    .btn { padding: 10px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn-primary { background: #1e40af; color: white; margin-top: 16px; width: 100%; }
    .btn-sm { padding: 5px 12px; border-radius: 6px; cursor: pointer; border: 1px solid #e2e8f0; font-size: 12px; background: white; margin-right: 4px; }
    .btn-danger { border-color: #fca5a5; color: #dc2626; }
    .hint { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .cron-examples { font-size: 12px; color: #64748b; margin-top: 6px; }
    .error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; padding: 10px 14px; border-radius: 6px; margin-top: 12px; font-size: 13px; display: none; }
    .success { background: #f0fdf4; border: 1px solid #86efac; color: #16a34a; padding: 10px 14px; border-radius: 6px; margin-top: 12px; font-size: 13px; display: none; }
  </style>
</head>
<body>
  <nav>
    <span class="brand">💰 Edu-Arbitrage</span>
    <a href="/">Дашборд</a>
    <a href="/schools.html">Школы</a>
    <a href="/payments.html">Выплаты</a>
    <a href="/schedules.html" class="active">Расписания</a>
  </nav>
  <div class="container">
    <h1>Расписания</h1>
    <div class="layout">
      <table>
        <thead><tr><th>Школа</th><th>Сумма</th><th>Расписание</th><th>Статус</th><th></th></tr></thead>
        <tbody id="schedulesTable"><tr><td colspan="5">Загрузка...</td></tr></tbody>
      </table>
      <div class="card">
        <h2>Новое расписание</h2>
        <label>Школа *</label>
        <select id="school_id"></select>
        <label>Сумма и валюта *</label>
        <div class="row">
          <input id="amount" type="number" placeholder="300" min="0.01" step="0.01" />
          <select id="currency">
            <option>USD</option><option>RUB</option><option>EUR</option><option>GBP</option><option>UZS</option>
          </select>
        </div>
        <label>Cron-расписание *</label>
        <input id="cron_expr" placeholder="0 9 1 * *" />
        <div class="cron-examples">
          Примеры:<br>
          <code>0 9 1 * *</code> — 1-го числа каждого месяца в 9:00<br>
          <code>0 10 * * 1</code> — каждый понедельник в 10:00<br>
          <code>0 9 * * *</code> — каждый день в 9:00
        </div>
        <button class="btn btn-primary" onclick="createSchedule()">Создать расписание</button>
        <div class="error" id="error"></div>
        <div class="success" id="success"></div>
      </div>
    </div>
  </div>
  <script>
    let schoolMap = {};

    async function loadData() {
      const [schools, schedules] = await Promise.all([
        fetch('/api/schools').then(r => r.json()),
        fetch('/api/schedules').then(r => r.json()),
      ]);

      schoolMap = {};
      schools.forEach(s => { schoolMap[s.id] = s.name; });

      const select = document.getElementById('school_id');
      select.innerHTML = schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

      const rows = schedules.map(s => `
        <tr>
          <td>${schoolMap[s.school_id] || '—'}</td>
          <td>${s.amount} ${s.currency}</td>
          <td style="font-family:monospace;font-size:12px">${s.cron_expr}</td>
          <td><span class="badge ${s.active ? 'active' : 'paused'}">${s.active ? '● активно' : '○ пауза'}</span></td>
          <td>
            <button class="btn-sm" onclick="toggleSchedule(${s.id}, ${s.active ? 0 : 1})">${s.active ? 'Пауза' : 'Запустить'}</button>
            <button class="btn-sm btn-danger" onclick="deleteSchedule(${s.id})">Удалить</button>
          </td>
        </tr>
      `).join('');
      document.getElementById('schedulesTable').innerHTML = rows || '<tr><td colspan="5">Нет расписаний</td></tr>';
    }

    async function createSchedule() {
      const school_id = document.getElementById('school_id').value;
      const amount = parseFloat(document.getElementById('amount').value);
      const currency = document.getElementById('currency').value;
      const cron_expr = document.getElementById('cron_expr').value.trim();
      const errEl = document.getElementById('error');
      const okEl = document.getElementById('success');
      errEl.style.display = 'none'; okEl.style.display = 'none';

      if (!school_id || !amount || !cron_expr) { errEl.textContent = 'Заполните все обязательные поля'; errEl.style.display = 'block'; return; }

      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: parseInt(school_id), amount, currency, cron_expr }),
      });
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }

      okEl.textContent = 'Расписание создано и активно';
      okEl.style.display = 'block';
      document.getElementById('amount').value = '';
      document.getElementById('cron_expr').value = '';
      loadData();
    }

    async function toggleSchedule(id, active) {
      await fetch(`/api/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      loadData();
    }

    async function deleteSchedule(id) {
      if (!confirm('Удалить расписание?')) return;
      await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      loadData();
    }

    loadData();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3001/schedules.html` — add a schedule, toggle pause/active, delete.

- [ ] **Step 3: Commit**

```powershell
cd E:\near_project
git add app2-fiat-settlement/backend/public/schedules.html
git commit -m "feat: schedules HTML — create/pause/delete recurring payments"
```

---

## Task 10: E2E Manual Test

**Goal:** verify the full cycle: school → payment with App 1 ID → confirmation → App 1 receives signal.

- [ ] **Step 1: Make sure App 1 is running**

```powershell
cd E:\near_project\app1-crypto-treasury\backend
npm start
# → App 1 Crypto Treasury running on port 3000
```

- [ ] **Step 2: Start App 2**

```powershell
cd E:\near_project\app2-fiat-settlement\backend
npm start
# → App 2 Fiat Settlement running on port 3001
```

- [ ] **Step 3: Add a school**

Open `http://localhost:3001/schools.html`, add a school "Test School" with currency USD.

- [ ] **Step 4: Create a payment in App 1**

```powershell
curl -X POST http://localhost:3000/api/lock `
  -H "Content-Type: application/json" `
  -d '{"paymentId":"e2e_001","amountUsdc":100000000}'
```

Expected: `{"success":true,"paymentId":"e2e_001"}`

- [ ] **Step 5: Create a payment in App 2**

Open `http://localhost:3001/payments.html`, create a payment:

- School: Test School
- Amount: 100 USD
- Payment ID from App 1: `e2e_001`

- [ ] **Step 6: Confirm the payment**

Click the "✓ Send" button next to the created payment.

Expected: status changes to `sent`. If App 1 is available — `app1_released: 1`. If App 1 is unavailable — a warning appears, but status is still `sent`.

- [ ] **Step 7: Check status in App 1**

```powershell
curl http://localhost:3000/api/payments/e2e_001
```

Expected: `{"payment_id":"e2e_001","status":"Released",...}`

- [ ] **Step 8: Final commit**

```powershell
cd E:\near_project
git add app2-fiat-settlement/
git commit -m "feat: app2 complete — E2E test passed"
```

---

## Summary

| Task | What we build | Tests |
|------|--------------|-------|
| 1 | Scaffold | — |
| 2 | db.js | 6 ✅ |
| 3 | payment.js | 5 ✅ |
| 4 | scheduler.js | 4 ✅ |
| 5 | index.js (API) | 8 ✅ |
| 6–9 | HTML pages | manual ✅ |
| 10 | E2E test | manual ✅ |

**Total: 23 unit tests + E2E**
