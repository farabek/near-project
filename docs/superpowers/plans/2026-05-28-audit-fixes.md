# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить все проблемы из аудита AUDIT-2026-05-28.md — 3 критических, 5 высоких, 7 средних, 6 низких.

**Architecture:** Правки разбиты по приоритету (критические → высокие → средние → низкие). Каждая задача независима, кроме Task 5 (зависит от Task 2 config) и Task 6 (зависит от Task 4). Подход TDD: сначала тест, потом код.

**Tech Stack:** Node.js 20+, Express 4, better-sqlite3, Jest/supertest, helmet, express-rate-limit, cors

---

## Файлы изменений

| Файл | Задачи |
|------|--------|
| `.gitignore` (корень) | Task 1 |
| `app2-fiat-settlement/.gitignore` | Task 1 |
| `app1-crypto-treasury/backend/.env.example` | Task 1 |
| `app2-fiat-settlement/backend/.env.example` | Task 1, Task 2 |
| `app2-fiat-settlement/backend/src/config.js` | Task 2 |
| `app2-fiat-settlement/backend/src/index.js` | Task 2, Task 4, Task 7, Task 8, Task 10, Task 11, Task 13 |
| `app2-fiat-settlement/backend/tests/api.test.js` | Task 2, Task 10 |
| `app2-fiat-settlement/backend/public/index.html` | Task 3 |
| `app2-fiat-settlement/backend/public/payments.html` | Task 3 |
| `app2-fiat-settlement/backend/public/schools.html` | Task 3 |
| `app2-fiat-settlement/backend/public/schedules.html` | Task 3 |
| `app2-fiat-settlement/backend/src/scheduler.js` | Task 5 |
| `app2-fiat-settlement/backend/src/db.js` | Task 5, Task 6, Task 10 |
| `app2-fiat-settlement/backend/tests/scheduler.test.js` | Task 5 |
| `app1-crypto-treasury/backend/src/index.js` | Task 7, Task 9, Task 11 |
| `app1-crypto-treasury/backend/tests/api.test.js` | Task 9 |
| `app1-crypto-treasury/backend/package.json` | Task 7, Task 12 |
| `app2-fiat-settlement/backend/package.json` | Task 7, Task 12 |
| `app1-crypto-treasury/backend/src/config.js` | Task 13 |
| `app1-crypto-treasury/backend/src/wallet.js` | Task 13 |
| `app1-crypto-treasury/backend/src/swap.js` | Task 13 |

---

## Task 1: Gitignore и env.example (C-1 частично, H-4, M-4)

**Files:**
- Modify: `.gitignore` (корень проекта)
- Modify: `app2-fiat-settlement/.gitignore`
- Modify: `app1-crypto-treasury/backend/.env.example`
- Modify: `app2-fiat-settlement/backend/.env.example`

> Нет тестов — это файлы конфигурации. Сначала делаем изменения, потом проверяем git status.

- [ ] **Step 1: Добавить `**/.env` в корневой .gitignore**

Открыть `E:\near_project\.gitignore`, добавить строки:

```
.claude/
.obsidian/
.superpowers/
near_project/
*.pdf
*.png
NEAR AI*/
**/.env
data/*.db
data/*.db-shm
data/*.db-wal
```

- [ ] **Step 2: Обновить app2 .gitignore**

Открыть `E:\near_project\app2-fiat-settlement\.gitignore`, добавить:

```
.env
data/*.db
data/*.db-shm
data/*.db-wal
```

- [ ] **Step 3: Добавить RELEASE_API_KEY в App 1 .env.example**

Открыть `E:\near_project\app1-crypto-treasury\backend\.env.example`, итоговое содержимое:

```
# NEAR Testnet credentials
# Скопируй этот файл в .env и заполни реальными значениями
# НЕ коммить .env в git!

NEAR_ACCOUNT_ID=yourname.testnet
NEAR_PRIVATE_KEY=ed25519:YOUR_PRIVATE_KEY_HERE
NEAR_CONTRACT_ID=escrow.yourname.testnet
NEAR_NETWORK=testnet
PORT=3000
RELEASE_API_KEY=your_strong_secret_key_here
```

- [ ] **Step 4: Добавить ADMIN_API_KEY в App 2 .env.example**

Открыть `E:\near_project\app2-fiat-settlement\backend\.env.example`, итоговое содержимое:

```
PORT=3001
APP1_URL=http://localhost:3000
APP1_RELEASE_API_KEY=your_app1_release_key_here
ADMIN_API_KEY=your_strong_admin_key_here
DB_PATH=./data/app2.db
```

- [ ] **Step 5: Убедиться, что .env не попал в git**

```bash
cd E:\near_project
git status
```

Ожидаемый результат: файлы `app1-crypto-treasury/backend/.env` и `app2-fiat-settlement/.env` НЕ должны быть перечислены в `Changes not staged` или `Untracked files` после изменения .gitignore.

Если .env уже отслеживается git:
```bash
git rm --cached app1-crypto-treasury/backend/.env
git rm --cached app2-fiat-settlement/.env
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore app2-fiat-settlement/.gitignore app1-crypto-treasury/backend/.env.example app2-fiat-settlement/backend/.env.example
git commit -m "security: protect .env files from git, fix env.example templates"
```

> **⚠️ ВАЖНО: Ротация приватного ключа (C-1)**
> После завершения всех задач, выполни команду:
> ```
> near generate-key farab.testnet --networkId testnet
> ```
> Это создаст новый ключ в `~/.near-credentials/testnet/farab.testnet.json`.
> Скопируй новый `private_key` в `.env`. Старый ключ (из AUDIT-2026-05-28.md) считается скомпрометированным.

---

## Task 2: Аутентификация App 2 API (C-2)

**Files:**
- Modify: `app2-fiat-settlement/backend/src/config.js`
- Modify: `app2-fiat-settlement/backend/src/index.js`
- Modify: `app2-fiat-settlement/backend/tests/api.test.js`

- [ ] **Step 1: Написать тест на 401 без API key**

В файле `app2-fiat-settlement/backend/tests/api.test.js`, добавить ПЕРЕД всеми describe-блоками:

```js
// Добавить в самое начало файла вместе с другими process.env:
process.env.ADMIN_API_KEY = 'test-admin-key';
```

Добавить новый describe-блок в начало тестов (после beforeAll):

```js
describe('Authentication middleware', () => {
  test('POST /api/schools returns 401 without API key', async () => {
    const res = await request(app).post('/api/schools').send({ name: 'Hack' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  test('DELETE /api/schools/:id returns 401 without API key', async () => {
    const res = await request(app).delete('/api/schools/1');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  test('POST /api/payments returns 401 without API key', async () => {
    const res = await request(app).post('/api/payments').send({ school_id: 1, amount: 100 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  test('POST /api/payments/:id/confirm returns 401 without API key', async () => {
    const res = await request(app).post('/api/payments/1/confirm');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться что ПАДАЕТ**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm test -- --testPathPattern=api.test
```

Ожидаемый результат: тесты `Authentication middleware` FAIL (сейчас возвращается 400/201, а не 401).

- [ ] **Step 3: Добавить adminApiKey в config.js**

Открыть `app2-fiat-settlement/backend/src/config.js`, итоговое содержимое:

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  app1Url: process.env.APP1_URL || 'http://localhost:3000',
  app1ApiKey: process.env.APP1_RELEASE_API_KEY || '',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  dbPath: process.env.DB_PATH || require('path').join(__dirname, '../../data/app2.db'),
};

function validateConfig() {
  if (!config.app1ApiKey) {
    throw new Error('APP1_RELEASE_API_KEY is required. Check your .env file.');
  }
  if (!config.adminApiKey) {
    throw new Error('ADMIN_API_KEY is required. Check your .env file.');
  }
}

module.exports = { config, validateConfig };
```

- [ ] **Step 4: Добавить requireAuth middleware в index.js**

В файле `app2-fiat-settlement/backend/src/index.js`, добавить ПОСЛЕ строки `let db;`:

```js
function requireAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== config.adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  }
  next();
}
```

- [ ] **Step 5: Применить requireAuth ко всем мутирующим эндпоинтам**

В `app2-fiat-settlement/backend/src/index.js` заменить сигнатуры роутов:

```js
// БЫЛО:
app.post('/api/schools', (req, res) => {
app.put('/api/schools/:id', (req, res) => {
app.delete('/api/schools/:id', (req, res) => {
app.post('/api/payments', (req, res) => {
app.post('/api/payments/:id/confirm', async (req, res) => {
app.post('/api/schedules', (req, res) => {
app.patch('/api/schedules/:id', (req, res) => {
app.delete('/api/schedules/:id', (req, res) => {

// СТАЛО:
app.post('/api/schools', requireAuth, (req, res) => {
app.put('/api/schools/:id', requireAuth, (req, res) => {
app.delete('/api/schools/:id', requireAuth, (req, res) => {
app.post('/api/payments', requireAuth, (req, res) => {
app.post('/api/payments/:id/confirm', requireAuth, async (req, res) => {
app.post('/api/schedules', requireAuth, (req, res) => {
app.patch('/api/schedules/:id', requireAuth, (req, res) => {
app.delete('/api/schedules/:id', requireAuth, (req, res) => {
```

- [ ] **Step 6: Обновить api.test.js — добавить API key во все мутирующие запросы**

Открыть `app2-fiat-settlement/backend/tests/api.test.js`. Добавить константу после `let app;`:

```js
const ADMIN_KEY = 'test-admin-key';
```

Затем найти все запросы `request(app).post(...)`, `.put(...)`, `.patch(...)`, `.delete(...)` и добавить `.set('x-api-key', ADMIN_KEY)`. Итоговый файл:

```js
// Must set env before requiring any module that reads config
process.env.APP1_RELEASE_API_KEY = 'test-key';
process.env.ADMIN_API_KEY = 'test-admin-key';
process.env.APP1_URL = 'http://localhost:3099';
process.env.PORT = '3002';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/api-test.db');
const ADMIN_KEY = 'test-admin-key';

let app;

beforeAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  app = require('../src/index');
  app.initApp(TEST_DB);
});

afterAll(() => {
  app.closeDb();
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  } catch (_) { /* ignore lock errors on Windows */ }
});

describe('Authentication middleware', () => {
  test('POST /api/schools returns 401 without API key', async () => {
    const res = await request(app).post('/api/schools').send({ name: 'Hack' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  test('DELETE /api/schools/:id returns 401 without API key', async () => {
    const res = await request(app).delete('/api/schools/1');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  test('POST /api/payments returns 401 without API key', async () => {
    const res = await request(app).post('/api/payments').send({ school_id: 1, amount: 100 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  test('POST /api/payments/:id/confirm returns 401 without API key', async () => {
    const res = await request(app).post('/api/payments/1/confirm');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });
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
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'Test School', bank_details: 'IBAN001', currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test School');
    expect(res.body.id).toBeDefined();
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });
});

describe('POST /api/payments', () => {
  let schoolId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'Payment Test School', currency: 'USD' });
    schoolId = res.body.id;
  });

  test('creates a payment with status pending', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 200, currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.amount).toBe(200);
  });

  test('returns 400 when amount is missing', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId });
    expect(res.status).toBe(400);
  });

  test('returns 400 when amount is a string', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 'abc', currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive number/i);
  });

  test('returns 400 when amount is negative', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: -50, currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive number/i);
  });
});

describe('POST /api/payments/:id/confirm', () => {
  let paymentId;
  let schoolId;

  beforeAll(async () => {
    const schoolRes = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'Confirm Test School', currency: 'USD' });
    schoolId = schoolRes.body.id;

    const paymentRes = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 300, currency: 'USD' });
    paymentId = paymentRes.body.id;
  });

  test('confirms payment, sets status to sent', async () => {
    const res = await request(app)
      .post(`/api/payments/${paymentId}/confirm`)
      .set('x-api-key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment.status).toBe('sent');
  });

  test('returns 400 on double confirm', async () => {
    const res = await request(app)
      .post(`/api/payments/${paymentId}/confirm`)
      .set('x-api-key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already sent/i);
  });
});

describe('DELETE /api/schools/:id', () => {
  test('returns 400 when school has payments', async () => {
    const schoolRes = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'School With Payments', currency: 'USD' });
    await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolRes.body.id, amount: 50, currency: 'USD' });

    const res = await request(app)
      .delete(`/api/schools/${schoolRes.body.id}`)
      .set('x-api-key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/existing payments/i);
  });
});

describe('Schedules API', () => {
  let schoolId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'Schedule School', currency: 'USD' });
    schoolId = res.body.id;
  });

  test('creates a schedule and returns it active', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 100, currency: 'USD', cron_expr: '0 9 1 * *' });
    expect(res.status).toBe(201);
    expect(res.body.active).toBe(1);
    expect(res.body.cron_expr).toBe('0 9 1 * *');
  });

  test('returns 400 for invalid cron_expr', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 100, currency: 'USD', cron_expr: 'not-a-cron' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid cron/i);
  });

  test('returns 400 when schedule amount is non-numeric', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 'abc', currency: 'USD', cron_expr: '0 9 1 * *' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive number/i);
  });
});
```

- [ ] **Step 7: Запустить тесты App 2 — убедиться что ВСЕ проходят**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm test
```

Ожидаемый результат: все тесты PASS (включая новые 4 auth теста).

- [ ] **Step 8: Commit**

```bash
git add app2-fiat-settlement/backend/src/config.js app2-fiat-settlement/backend/src/index.js app2-fiat-settlement/backend/tests/api.test.js app2-fiat-settlement/backend/.env.example
git commit -m "security: add API key authentication to App 2 endpoints"
```

---

## Task 3: XSS защита в HTML (C-3)

**Files:**
- Modify: `app2-fiat-settlement/backend/public/index.html`
- Modify: `app2-fiat-settlement/backend/public/payments.html`
- Modify: `app2-fiat-settlement/backend/public/schools.html`
- Modify: `app2-fiat-settlement/backend/public/schedules.html`

> XSS в HTML тестируется вручную (браузер), не через Jest. Тест: создать школу с именем `<b>bold</b>` — в таблице должен появиться текст буквально `<b>bold</b>`, а не жирный текст.

- [ ] **Step 1: Добавить escapeHtml в index.html**

В файле `app2-fiat-settlement/backend/public/index.html`, найти тег `<script>` и добавить функцию в самое начало скрипта:

```js
function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

Затем исправить строки с innerHTML. Было:
```js
const rows = paymentsRes.slice(0, 10).map(p => `
  <tr>
    <td>${schoolMap[p.school_id] || '—'}</td>
    <td>${p.amount} ${p.currency}</td>
    <td><span class="badge ${p.status}">${p.status}</span></td>
    <td>${p.created_at.slice(0, 10)}</td>
  </tr>
`).join('');
```

Стало:
```js
const rows = paymentsRes.slice(0, 10).map(p => `
  <tr>
    <td>${escapeHtml(schoolMap[p.school_id]) || '—'}</td>
    <td>${escapeHtml(String(p.amount))} ${escapeHtml(p.currency)}</td>
    <td><span class="badge ${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td>
    <td>${escapeHtml(p.created_at.slice(0, 10))}</td>
  </tr>
`).join('');
```

- [ ] **Step 2: Добавить escapeHtml в payments.html**

Найти тег `<script>`, добавить функцию в начало:

```js
function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

Исправить строку с `select.innerHTML` — было:
```js
select.innerHTML = schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
```
Стало:
```js
select.innerHTML = schools.map(s => `<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.name)}</option>`).join('');
```

Исправить строки с `paymentsTable.innerHTML` — было:
```js
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
```
Стало:
```js
const rows = payments.map(p => `
  <tr>
    <td>${escapeHtml(schoolMap[p.school_id]) || '—'}</td>
    <td>${escapeHtml(String(p.amount))} ${escapeHtml(p.currency)}</td>
    <td style="font-family:monospace;font-size:12px;color:#64748b">${escapeHtml(p.app1_payment_id || '—')}</td>
    <td><span class="badge ${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td>
    <td>${escapeHtml(p.created_at.slice(0, 10))}</td>
    <td>${p.status === 'pending' ? `<button class="btn-confirm" onclick="confirmPayment(${Number(p.id)})">✓ Отправить</button>` : ''}</td>
  </tr>
`).join('');
```

- [ ] **Step 3: Добавить escapeHtml в schools.html**

Найти тег `<script>`, добавить:

```js
function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

Исправить `schoolsTable.innerHTML`. Было:
```js
const rows = schools.map(s => `
  <tr>
    <td>${s.name}</td>
    <td>${s.currency}</td>
    <td style="color:#64748b;font-size:13px">${s.bank_details || '—'}</td>
    <td><button class="btn-danger" onclick="deleteSchool(${s.id}, '${s.name.replace(/'/g, "\\'")}')">Удалить</button></td>
  </tr>
`).join('');
```
Стало:
```js
const rows = schools.map(s => `
  <tr>
    <td>${escapeHtml(s.name)}</td>
    <td>${escapeHtml(s.currency)}</td>
    <td style="color:#64748b;font-size:13px">${escapeHtml(s.bank_details || '—')}</td>
    <td><button class="btn-danger" onclick="deleteSchool(${Number(s.id)})">Удалить</button></td>
  </tr>
`).join('');
```

Обратить внимание: передача имени в `onclick` через строку сама по себе XSS-вектор, поэтому убираем имя из параметра. Функцию `deleteSchool` поменять:

Было:
```js
async function deleteSchool(id, name) {
  if (!confirm(`Удалить "${name}"?`)) return;
```
Стало:
```js
async function deleteSchool(id) {
  if (!confirm('Удалить эту школу?')) return;
```

- [ ] **Step 4: Добавить escapeHtml в schedules.html**

Найти тег `<script>`, добавить:

```js
function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

Исправить `select.innerHTML` — было:
```js
select.innerHTML = schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
```
Стало:
```js
select.innerHTML = schools.map(s => `<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.name)}</option>`).join('');
```

Исправить `schedulesTable.innerHTML` — было:
```js
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
```
Стало:
```js
const rows = schedules.map(s => `
  <tr>
    <td>${escapeHtml(schoolMap[s.school_id]) || '—'}</td>
    <td>${escapeHtml(String(s.amount))} ${escapeHtml(s.currency)}</td>
    <td style="font-family:monospace;font-size:12px">${escapeHtml(s.cron_expr)}</td>
    <td><span class="badge ${s.active ? 'active' : 'paused'}">${s.active ? '● активно' : '○ пауза'}</span></td>
    <td>
      <button class="btn-sm" onclick="toggleSchedule(${Number(s.id)}, ${s.active ? 0 : 1})">${s.active ? 'Пауза' : 'Запустить'}</button>
      <button class="btn-sm btn-danger" onclick="deleteSchedule(${Number(s.id)})">Удалить</button>
    </td>
  </tr>
`).join('');
```

- [ ] **Step 5: Commit**

```bash
git add app2-fiat-settlement/backend/public/
git commit -m "security: fix XSS vulnerabilities in HTML dashboard templates"
```

---

## Task 4: Race condition при подтверждении выплаты (H-2)

**Files:**
- Modify: `app2-fiat-settlement/backend/src/index.js`

- [ ] **Step 1: Написать тест (уже существует в api.test.js)**

Тест `returns 400 on double confirm` уже существует. Он проверяет что второй confirm вернёт 400. После наших изменений сообщение об ошибке изменится с `already sent` на `already sent or in progress`. Проверить:

```bash
grep -n "already sent" app2-fiat-settlement/backend/tests/api.test.js
```

Тест использует `/already sent/i`, что совпадёт с новым сообщением `Payment already sent or in progress`. Менять тест не нужно.

- [ ] **Step 2: Реализовать атомарный UPDATE**

В файле `app2-fiat-settlement/backend/src/index.js`, найти обработчик `POST /api/payments/:id/confirm` и заменить начало функции:

Было (строки 89-92):
```js
app.post('/api/payments/:id/confirm', requireAuth, async (req, res) => {
  const payment = getPayment(db, req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status === 'sent') return res.status(400).json({ error: 'Payment already sent' });
```

Стало:
```js
app.post('/api/payments/:id/confirm', requireAuth, async (req, res) => {
  const payment = getPayment(db, req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const locked = db.prepare(
    "UPDATE payments SET status='processing' WHERE id=? AND status='pending'"
  ).run(req.params.id);
  if (locked.changes === 0) {
    return res.status(400).json({ error: 'Payment already sent or in progress' });
  }
```

- [ ] **Step 3: Запустить тесты App 2**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 4: Commit**

```bash
git add app2-fiat-settlement/backend/src/index.js
git commit -m "fix: prevent double payment confirmation via atomic status update"
```

---

## Task 5: Scheduler вызывает App 1 release (H-3)

**Files:**
- Modify: `app2-fiat-settlement/backend/src/db.js` (добавить app1_payment_id в schedules)
- Modify: `app2-fiat-settlement/backend/src/index.js` (обновить POST /api/schedules)
- Modify: `app2-fiat-settlement/backend/src/scheduler.js` (вызов releaseApp1)
- Modify: `app2-fiat-settlement/backend/tests/scheduler.test.js`

- [ ] **Step 1: Написать тест для scheduler с app1_payment_id**

В файле `app2-fiat-settlement/backend/tests/scheduler.test.js`, добавить новый describe-блок:

```js
const { mockSendPayment, releaseApp1 } = require('../src/payment');

jest.mock('../src/payment', () => ({
  mockSendPayment: jest.fn().mockResolvedValue({ success: true, ref: 'mock_ref' }),
  releaseApp1: jest.fn(),
}));

describe('runScheduledPayment with app1_payment_id', () => {
  test('calls releaseApp1 when app1_payment_id is set and sets app1_released=1', async () => {
    releaseApp1.mockResolvedValue({ success: true });
    const school = dbModule.addSchool(db, { name: 'School', currency: 'USD' });
    const schedule = {
      id: 1, school_id: school.id, amount: 100, currency: 'USD', app1_payment_id: 'pay_001',
    };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    expect(releaseApp1).toHaveBeenCalledWith(testConfig.app1Url, testConfig.app1ApiKey, 'pay_001');
    const payments = dbModule.getAllPayments(db);
    expect(payments[0].app1_released).toBe(1);
  });

  test('sets app1_released=0 when releaseApp1 fails', async () => {
    releaseApp1.mockRejectedValue(new Error('App 1 down'));
    const school = dbModule.addSchool(db, { name: 'School2', currency: 'USD' });
    const schedule = {
      id: 2, school_id: school.id, amount: 50, currency: 'USD', app1_payment_id: 'pay_002',
    };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    const payments = dbModule.getAllPayments(db);
    expect(payments[0].app1_released).toBe(0);
  });
});
```

> **Важно:** блок `jest.mock('../src/payment', ...)` нужно поставить в самое начало файла (после импортов, но до describe-блоков) — Jest hoisting требует этого.

- [ ] **Step 2: Запустить тест — убедиться что ПАДАЕТ**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm test -- --testPathPattern=scheduler.test
```

Ожидаемый результат: новые тесты FAIL.

- [ ] **Step 3: Добавить app1_payment_id в таблицу schedules**

В файле `app2-fiat-settlement/backend/src/db.js`, найти CREATE TABLE schedules и добавить колонку:

```sql
CREATE TABLE IF NOT EXISTS schedules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id        INTEGER NOT NULL REFERENCES schools(id),
  app1_payment_id  TEXT,
  amount           REAL NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  cron_expr        TEXT NOT NULL,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

В функции `createSchedule`:

Было:
```js
function createSchedule(db, { school_id, amount, currency = 'USD', cron_expr }) {
  const result = db.prepare(
    'INSERT INTO schedules (school_id, amount, currency, cron_expr) VALUES (?, ?, ?, ?)'
  ).run(school_id, amount, currency, cron_expr);
```

Стало:
```js
function createSchedule(db, { school_id, app1_payment_id, amount, currency = 'USD', cron_expr }) {
  const result = db.prepare(
    'INSERT INTO schedules (school_id, app1_payment_id, amount, currency, cron_expr) VALUES (?, ?, ?, ?, ?)'
  ).run(school_id, app1_payment_id || null, amount, currency, cron_expr);
```

В `module.exports` ничего менять не нужно.

- [ ] **Step 4: Обновить POST /api/schedules в index.js**

В `app2-fiat-settlement/backend/src/index.js`, найти `app.post('/api/schedules', ...)`:

Было:
```js
const { school_id, amount, currency, cron_expr } = req.body;
```
Стало:
```js
const { school_id, app1_payment_id, amount, currency, cron_expr } = req.body;
```

И в вызове createSchedule:

Было:
```js
const schedule = createSchedule(db, { school_id, amount, currency, cron_expr });
```
Стало:
```js
const schedule = createSchedule(db, { school_id, app1_payment_id, amount, currency, cron_expr });
```

- [ ] **Step 5: Обновить scheduler.js — добавить вызов releaseApp1**

Открыть `app2-fiat-settlement/backend/src/scheduler.js`, итоговое содержимое:

```js
const cron = require('node-cron');
const { getAllSchedules, createPayment, confirmPayment } = require('./db');
const { mockSendPayment, releaseApp1 } = require('./payment');

const activeTasks = new Map();

function startScheduler(db, config) {
  const schedules = getAllSchedules(db).filter((s) => s.active);
  for (const schedule of schedules) {
    registerSchedule(db, config, schedule);
  }
}

function registerSchedule(db, config, schedule) {
  if (activeTasks.has(schedule.id)) return;
  if (!cron.validate(schedule.cron_expr)) {
    console.error(`Invalid cron expression for schedule ${schedule.id}: "${schedule.cron_expr}"`);
    return;
  }

  const task = cron.schedule(schedule.cron_expr, async () => {
    try {
      await runScheduledPayment(db, config, schedule);
    } catch (err) {
      console.error(`Scheduler error for schedule ${schedule.id}:`, err);
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

function stopAllSchedules() {
  for (const task of activeTasks.values()) {
    task.stop();
  }
  activeTasks.clear();
}

async function runScheduledPayment(db, config, schedule) {
  await mockSendPayment({ amount: schedule.amount, currency: schedule.currency });

  const payment = createPayment(db, {
    school_id: schedule.school_id,
    amount: schedule.amount,
    currency: schedule.currency,
  });

  let app1Released = false;
  if (schedule.app1_payment_id) {
    try {
      await releaseApp1(config.app1Url, config.app1ApiKey, schedule.app1_payment_id);
      app1Released = true;
    } catch (err) {
      console.error(`Scheduler: App 1 release failed for schedule ${schedule.id}:`, err);
    }
  }

  confirmPayment(db, payment.id, { app1_released: app1Released });
  return payment;
}

module.exports = { startScheduler, registerSchedule, unregisterSchedule, stopAllSchedules, runScheduledPayment };
```

- [ ] **Step 6: Обновить scheduler.test.js с правильной структурой jest.mock**

Полный итоговый файл `app2-fiat-settlement/backend/tests/scheduler.test.js`:

```js
jest.mock('../src/payment', () => ({
  mockSendPayment: jest.fn().mockResolvedValue({ success: true, ref: 'mock_ref' }),
  releaseApp1: jest.fn(),
}));

const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/scheduler-test.db');

let db;
let dbModule;
let schedulerModule;
let paymentModule;

beforeEach(() => {
  jest.resetModules();
  jest.mock('../src/payment', () => ({
    mockSendPayment: jest.fn().mockResolvedValue({ success: true, ref: 'mock_ref' }),
    releaseApp1: jest.fn(),
  }));
  dbModule = require('../src/db');
  schedulerModule = require('../src/scheduler');
  paymentModule = require('../src/payment');
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

  test('calls releaseApp1 when app1_payment_id is set and sets app1_released=1', async () => {
    paymentModule.releaseApp1.mockResolvedValue({ success: true });
    const school = dbModule.addSchool(db, { name: 'School', currency: 'USD' });
    const schedule = {
      id: 1, school_id: school.id, amount: 100, currency: 'USD', app1_payment_id: 'pay_001',
    };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    expect(paymentModule.releaseApp1).toHaveBeenCalledWith(
      testConfig.app1Url, testConfig.app1ApiKey, 'pay_001'
    );
    const payments = dbModule.getAllPayments(db);
    expect(payments[0].app1_released).toBe(1);
  });

  test('sets app1_released=0 when releaseApp1 fails', async () => {
    paymentModule.releaseApp1.mockRejectedValue(new Error('App 1 down'));
    const school = dbModule.addSchool(db, { name: 'School2', currency: 'USD' });
    const schedule = {
      id: 2, school_id: school.id, amount: 50, currency: 'USD', app1_payment_id: 'pay_002',
    };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    const payments = dbModule.getAllPayments(db);
    expect(payments[0].app1_released).toBe(0);
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

- [ ] **Step 7: Запустить все тесты App 2**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 8: Commit**

```bash
git add app2-fiat-settlement/backend/src/db.js app2-fiat-settlement/backend/src/scheduler.js app2-fiat-settlement/backend/src/index.js app2-fiat-settlement/backend/tests/scheduler.test.js
git commit -m "fix: scheduler now calls App 1 release when app1_payment_id is set"
```

---

## Task 6: INTEGER вместо REAL для денежных сумм (H-1)

**Files:**
- Modify: `app2-fiat-settlement/backend/src/db.js`

> Суммы хранятся как целые числа (доллары/рубли без копеек). Если понадобятся копейки в будущем — хранить в центах (умножать/делить на 100). Для текущего testnet-демо достаточно целых чисел.

- [ ] **Step 1: Изменить тип amount в схеме db.js**

В файле `app2-fiat-settlement/backend/src/db.js`, найти и заменить `amount REAL NOT NULL` в обоих местах (payments и schedules):

В таблице payments:
```sql
-- БЫЛО:
amount           REAL NOT NULL,
-- СТАЛО:
amount           INTEGER NOT NULL,
```

В таблице schedules:
```sql
-- БЫЛО:
amount     REAL NOT NULL,
-- СТАЛО:
amount     INTEGER NOT NULL,
```

- [ ] **Step 2: Добавить валидацию целого числа в API (index.js)**

В `app2-fiat-settlement/backend/src/index.js`, найти POST /api/payments — проверку amount:

Было:
```js
if (!school_id || amount == null || isNaN(Number(amount)) || Number(amount) <= 0) {
  return res.status(400).json({ error: 'school_id and amount (positive number) are required' });
}
```

Стало:
```js
const parsedAmount = Number(amount);
if (!school_id || amount == null || isNaN(parsedAmount) || parsedAmount <= 0 || !Number.isInteger(parsedAmount)) {
  return res.status(400).json({ error: 'school_id and amount (positive integer) are required' });
}
```

Аналогично для POST /api/schedules:

Было:
```js
if (!school_id || amount == null || isNaN(Number(amount)) || Number(amount) <= 0 || !cron_expr) {
  return res.status(400).json({ error: 'school_id, amount (positive number), and cron_expr are required' });
}
```

Стало:
```js
const parsedAmount = Number(amount);
if (!school_id || amount == null || isNaN(parsedAmount) || parsedAmount <= 0 || !Number.isInteger(parsedAmount) || !cron_expr) {
  return res.status(400).json({ error: 'school_id, amount (positive integer), and cron_expr are required' });
}
```

- [ ] **Step 3: Удалить существующую БД (данные testnet не нужны)**

```bash
del "E:\near_project\app2-fiat-settlement\backend\data\app2.db"
```

- [ ] **Step 4: Обновить тест на сообщение об ошибке**

В `app2-fiat-settlement/backend/tests/api.test.js`, найти и обновить тест:

Было:
```js
expect(res.body.error).toMatch(/positive number/i);
```
Стало (для обоих тестов на amount):
```js
expect(res.body.error).toMatch(/positive integer/i);
```

И добавить тест на дробное число:
```js
test('returns 400 when amount is fractional', async () => {
  const res = await request(app)
    .post('/api/payments')
    .set('x-api-key', ADMIN_KEY)
    .send({ school_id: schoolId, amount: 99.5, currency: 'USD' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/positive integer/i);
});
```

- [ ] **Step 5: Запустить все тесты App 2**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 6: Commit**

```bash
git add app2-fiat-settlement/backend/src/db.js app2-fiat-settlement/backend/src/index.js app2-fiat-settlement/backend/tests/api.test.js
git commit -m "fix: store monetary amounts as INTEGER to avoid float precision errors"
```

---

## Task 7: Security middleware — helmet, rate-limit, CORS (M-1, M-2, M-3)

**Files:**
- Modify: `app1-crypto-treasury/backend/package.json`
- Modify: `app2-fiat-settlement/backend/package.json`
- Modify: `app1-crypto-treasury/backend/src/index.js`
- Modify: `app2-fiat-settlement/backend/src/index.js`

- [ ] **Step 1: Установить пакеты в App 1**

```bash
cd E:\near_project\app1-crypto-treasury\backend
npm install helmet express-rate-limit cors
```

- [ ] **Step 2: Установить пакеты в App 2**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm install helmet express-rate-limit cors
```

- [ ] **Step 3: Добавить middleware в App 1 (index.js)**

В `app1-crypto-treasury/backend/src/index.js`, найти строки в начале файла:

```js
const express = require('express');
const nearAPI = require('near-api-js');
```

Заменить на:

```js
const express = require('express');
const nearAPI = require('near-api-js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
```

После строки `app.use(express.json());` добавить:

```js
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));
```

- [ ] **Step 4: Добавить middleware в App 2 (index.js)**

В `app2-fiat-settlement/backend/src/index.js`, найти начало файла:

```js
const express = require('express');
const path = require('path');
```

Заменить на:

```js
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
```

После строки `app.use(express.json());` добавить:

```js
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));
```

- [ ] **Step 5: Запустить тесты обоих приложений**

```bash
cd E:\near_project\app1-crypto-treasury\backend && npm test
cd E:\near_project\app2-fiat-settlement\backend && npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 6: Commit**

```bash
git add app1-crypto-treasury/backend/ app2-fiat-settlement/backend/
git commit -m "security: add helmet, rate-limiting, and CORS to both apps"
```

---

## Task 8: Error handling при старте App 2 (M-7)

**Files:**
- Modify: `app2-fiat-settlement/backend/src/index.js`

- [ ] **Step 1: Обернуть initApp в try/catch при старте**

В `app2-fiat-settlement/backend/src/index.js`, найти блок в конце файла:

Было:
```js
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
```

Стало:
```js
if (require.main === module) {
  try {
    validateConfig();
    initApp();
  } catch (err) {
    console.error('Failed to initialize App 2:', err.message);
    process.exit(1);
  }
  startScheduler(db, config);
  app.listen(config.port, () => {
    console.log(`App 2 Fiat Settlement running on port ${config.port}`);
    console.log(`  App 1 URL: ${config.app1Url}`);
    console.log(`  DB:        ${config.dbPath}`);
  });
}
```

- [ ] **Step 2: Запустить тесты App 2**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 3: Commit**

```bash
git add app2-fiat-settlement/backend/src/index.js
git commit -m "fix: crash on startup if DB initialization fails instead of running with null db"
```

---

## Task 9: minAmountOut обязателен для свапа (M-5)

**Files:**
- Modify: `app1-crypto-treasury/backend/src/index.js`
- Modify: `app1-crypto-treasury/backend/tests/api.test.js`

- [ ] **Step 1: Обновить тест — убрать "default 0" тест, добавить "required" тест**

В `app1-crypto-treasury/backend/tests/api.test.js`, найти тест:

```js
it('uses default minAmountOut of 0 if not provided', async () => {
```

Заменить его на:

```js
it('returns 400 if minAmountOut is not provided', async () => {
  const res = await request(app)
    .post('/api/swap')
    .set('x-api-key', 'test-api-key')
    .send({ amountNEAR: '0.5' });

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/minAmountOut/);
});
```

- [ ] **Step 2: Запустить тест — убедиться что ПАДАЕТ**

```bash
cd E:\near_project\app1-crypto-treasury\backend
npm test -- --testPathPattern=api.test
```

Ожидаемый результат: новый тест FAIL (сейчас возвращается 200 с default '0').

- [ ] **Step 3: Сделать minAmountOut обязательным**

В `app1-crypto-treasury/backend/src/index.js`, найти обработчик POST /api/swap:

Было:
```js
const { amountNEAR, minAmountOut = '0' } = req.body;
if (!amountNEAR) {
  return res.status(400).json({ error: 'amountNEAR is required' });
}
```

Стало:
```js
const { amountNEAR, minAmountOut } = req.body;
if (!amountNEAR || minAmountOut == null) {
  return res.status(400).json({ error: 'amountNEAR and minAmountOut are required' });
}
```

- [ ] **Step 4: Запустить тесты App 1**

```bash
cd E:\near_project\app1-crypto-treasury\backend
npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 5: Commit**

```bash
git add app1-crypto-treasury/backend/src/index.js app1-crypto-treasury/backend/tests/api.test.js
git commit -m "fix: require explicit minAmountOut for swap to prevent unexpected slippage"
```

---

## Task 10: Пагинация на GET эндпоинтах (M-6)

**Files:**
- Modify: `app2-fiat-settlement/backend/src/db.js`
- Modify: `app2-fiat-settlement/backend/src/index.js`
- Modify: `app2-fiat-settlement/backend/tests/api.test.js`

- [ ] **Step 1: Добавить пагинированную функцию в db.js**

В файле `app2-fiat-settlement/backend/src/db.js`, добавить после `getAllPayments`:

```js
function getPaymentsPaginated(db, limit, offset) {
  return db.prepare(
    'SELECT * FROM payments ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
}
```

Добавить `getPaymentsPaginated` в `module.exports`.

- [ ] **Step 2: Обновить GET /api/payments в index.js**

В `app2-fiat-settlement/backend/src/index.js`, обновить импорт db:

```js
const {
  initDb,
  addSchool, getSchool, getAllSchools, updateSchool, deleteSchool,
  createPayment, getPayment, getAllPayments, confirmPayment, getPaymentsPaginated,
  createSchedule, getSchedule, getAllSchedules, toggleSchedule, deleteSchedule,
} = require('./db');
```

Найти обработчик `GET /api/payments`:

Было:
```js
app.get('/api/payments', (req, res) => {
  res.json(getAllPayments(db));
});
```

Стало:
```js
app.get('/api/payments', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  if (req.query.limit || req.query.offset) {
    return res.json(getPaymentsPaginated(db, limit, offset));
  }
  res.json(getAllPayments(db));
});
```

- [ ] **Step 3: Добавить тест пагинации**

В `app2-fiat-settlement/backend/tests/api.test.js`, добавить describe-блок:

```js
describe('GET /api/payments pagination', () => {
  let schoolId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'Pagination School', currency: 'USD' });
    schoolId = res.body.id;

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/payments')
        .set('x-api-key', ADMIN_KEY)
        .send({ school_id: schoolId, amount: 100 + i, currency: 'USD' });
    }
  });

  test('returns at most limit payments', async () => {
    const res = await request(app).get('/api/payments?limit=2&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(2);
  });

  test('limit cannot exceed 200', async () => {
    const res = await request(app).get('/api/payments?limit=999&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(200);
  });
});
```

- [ ] **Step 4: Запустить тесты App 2**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 5: Commit**

```bash
git add app2-fiat-settlement/backend/src/db.js app2-fiat-settlement/backend/src/index.js app2-fiat-settlement/backend/tests/api.test.js
git commit -m "feat: add pagination to GET /api/payments endpoint"
```

---

## Task 11: Health check эндпоинты (L-2)

**Files:**
- Modify: `app1-crypto-treasury/backend/src/index.js`
- Modify: `app2-fiat-settlement/backend/src/index.js`

- [ ] **Step 1: Добавить GET /health в App 1**

В `app1-crypto-treasury/backend/src/index.js`, добавить после `app.use(express.json());`:

```js
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));
```

- [ ] **Step 2: Добавить GET /health в App 2**

В `app2-fiat-settlement/backend/src/index.js`, добавить сразу после строки `let db;`:

```js
// Health check — не требует auth и не зависит от db
// (устанавливается раньше requireAuth)
```

Добавить роут ПЕРЕД requireAuth (чтобы health check не требовал ключа):

```js
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));
```

- [ ] **Step 3: Запустить тесты обоих приложений**

```bash
cd E:\near_project\app1-crypto-treasury\backend && npm test
cd E:\near_project\app2-fiat-settlement\backend && npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 4: Commit**

```bash
git add app1-crypto-treasury/backend/src/index.js app2-fiat-settlement/backend/src/index.js
git commit -m "feat: add GET /health endpoint to both apps for monitoring"
```

---

## Task 12: Node.js версия в package.json (L-3)

**Files:**
- Modify: `app1-crypto-treasury/backend/package.json`
- Modify: `app2-fiat-settlement/backend/package.json`

- [ ] **Step 1: Добавить engines в App 1 package.json**

В `app1-crypto-treasury/backend/package.json`, добавить поле `"engines"` после `"version"`:

```json
"engines": { "node": ">=20.0.0" },
```

- [ ] **Step 2: Добавить engines в App 2 package.json**

В `app2-fiat-settlement/backend/package.json`, добавить поле `"engines"` после `"version"`:

```json
"engines": { "node": ">=20.0.0" },
```

- [ ] **Step 3: Commit**

```bash
git add app1-crypto-treasury/backend/package.json app2-fiat-settlement/backend/package.json
git commit -m "chore: pin minimum Node.js version to >=20.0.0 in package.json"
```

---

## Task 13: Вынести testnet контракты в config (L-4)

**Files:**
- Modify: `app1-crypto-treasury/backend/src/config.js`
- Modify: `app1-crypto-treasury/backend/src/wallet.js`
- Modify: `app1-crypto-treasury/backend/src/swap.js`

- [ ] **Step 1: Добавить константы в config.js**

В `app1-crypto-treasury/backend/src/config.js`, добавить поля:

```js
const TESTNET_DEFAULTS = {
  usdcContract: 'usdc.fakes.testnet',
  refFinance: 'ref-finance-101.testnet',
  wNear: 'wrap.testnet',
  wNearUsdcPoolId: 54,
};

const MAINNET_DEFAULTS = {
  usdcContract: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a',
  refFinance: 'v2.ref-finance.near',
  wNear: 'wrap.near',
  wNearUsdcPoolId: 4512,
};
```

Итоговый config.js:

```js
require('dotenv').config();

const TESTNET_DEFAULTS = {
  usdcContract: 'usdc.fakes.testnet',
  refFinance: 'ref-finance-101.testnet',
  wNear: 'wrap.testnet',
  wNearUsdcPoolId: 54,
};

const MAINNET_DEFAULTS = {
  usdcContract: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a',
  refFinance: 'v2.ref-finance.near',
  wNear: 'wrap.near',
  wNearUsdcPoolId: 4512,
};

const networkId = process.env.NEAR_NETWORK || 'testnet';
const networkDefaults = networkId === 'mainnet' ? MAINNET_DEFAULTS : TESTNET_DEFAULTS;

const config = {
  accountId: process.env.NEAR_ACCOUNT_ID,
  privateKey: process.env.NEAR_PRIVATE_KEY,
  contractId: process.env.NEAR_CONTRACT_ID,
  networkId,
  nodeUrl: networkId === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org',
  port: parseInt(process.env.PORT || '3000', 10),
  releaseApiKey: process.env.RELEASE_API_KEY,
  usdcContract: process.env.USDC_CONTRACT || networkDefaults.usdcContract,
  refFinance: process.env.REF_FINANCE || networkDefaults.refFinance,
  wNear: process.env.WNEAR || networkDefaults.wNear,
  wNearUsdcPoolId: parseInt(process.env.WNEAR_USDC_POOL_ID || String(networkDefaults.wNearUsdcPoolId), 10),
};

function validateConfig() {
  const required = ['accountId', 'privateKey', 'contractId', 'releaseApiKey'];
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required env var for: ${key}. Check your .env file.`);
    }
  }
}

module.exports = { config, validateConfig };
```

- [ ] **Step 2: Обновить wallet.js — использовать config**

В `app1-crypto-treasury/backend/src/wallet.js`:

Было:
```js
const USDC_CONTRACT = 'usdc.fakes.testnet';
const USDC_DECIMALS = 6;

async function loadAccount(config) {
```

Стало (убрать константу, принимать из config):

```js
const nearAPI = require('near-api-js');

const USDC_DECIMALS = 6;

async function loadAccount(config) {
  const keyPair = nearAPI.KeyPair.fromString(config.privateKey);
  const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
  await keyStore.setKey(config.networkId, config.accountId, keyPair);

  const near = await nearAPI.connect({
    networkId: config.networkId,
    keyStore,
    nodeUrl: config.nodeUrl,
  });

  return near.account(config.accountId);
}

async function getNEARBalance(account) {
  const state = await account.state();
  const near = nearAPI.utils.format.formatNearAmount(state.amount, 2);
  return { yocto: state.amount, near };
}

async function getUSDCBalance(account, usdcContract) {
  const argsBase64 = Buffer.from(JSON.stringify({ account_id: account.accountId })).toString('base64');
  const result = await account.connection.provider.query({
    request_type: 'call_function',
    account_id: usdcContract,
    method_name: 'ft_balance_of',
    args_base64: argsBase64,
    finality: 'final',
  });
  const raw = JSON.parse(Buffer.from(result.result).toString());
  const usdc = (parseInt(raw, 10) / Math.pow(10, USDC_DECIMALS)).toFixed(2);
  return { raw, usdc };
}

module.exports = { loadAccount, getNEARBalance, getUSDCBalance };
```

- [ ] **Step 3: Обновить index.js — передать usdcContract в getUSDCBalance**

В `app1-crypto-treasury/backend/src/index.js`, найти вызов getUSDCBalance:

Было:
```js
getUSDCBalance(account),
```
Стало:
```js
getUSDCBalance(account, config.usdcContract),
```

- [ ] **Step 4: Обновить swap.js — использовать config**

В `app1-crypto-treasury/backend/src/swap.js`:

Было:
```js
const REF_FINANCE = 'ref-finance-101.testnet';
const WNEAR = 'wrap.testnet';
const USDC = 'usdc.fakes.testnet';
const WNEAR_USDC_POOL_ID = 54;

async function wrapNEAR(account, amountYocto) {
  return account.functionCall({
    contractId: WNEAR,
```

Стало:
```js
async function wrapNEAR(account, amountYocto, wNear) {
  return account.functionCall({
    contractId: wNear,
    methodName: 'near_deposit',
    args: {},
    gas: '30000000000000',
    attachedDeposit: amountYocto,
  });
}

async function swapNEARtoUSDC(account, amountYocto, minAmountOut, { refFinance, wNear, usdcContract, wNearUsdcPoolId }) {
  return account.functionCall({
    contractId: wNear,
    methodName: 'ft_transfer_call',
    args: {
      receiver_id: refFinance,
      amount: amountYocto,
      msg: JSON.stringify({
        actions: [
          {
            pool_id: wNearUsdcPoolId,
            token_in: wNear,
            token_out: usdcContract,
            amount_in: amountYocto,
            min_amount_out: minAmountOut,
          },
        ],
      }),
    },
    gas: '180000000000000',
    attachedDeposit: '1',
  });
}

module.exports = { wrapNEAR, swapNEARtoUSDC };
```

- [ ] **Step 5: Обновить index.js — передать config в wrapNEAR и swapNEARtoUSDC**

В `app1-crypto-treasury/backend/src/index.js`, найти вызовы:

Было:
```js
await wrapNEAR(account, amountYocto);
await swapNEARtoUSDC(account, amountYocto, minAmountOut);
```
Стало:
```js
await wrapNEAR(account, amountYocto, config.wNear);
await swapNEARtoUSDC(account, amountYocto, minAmountOut, config);
```

- [ ] **Step 6: Обновить тест — wallet.test.js и swap.test.js**

В `app1-crypto-treasury/backend/tests/api.test.js`, мок `near-api-js` используется для `parseNearAmount`, а wallet/swap мокированы полностью. Тесты не сломаются.

Но нужно проверить `wallet.test.js` и `swap.test.js` — они могут использовать старые сигнатуры.

```bash
cd E:\near_project\app1-crypto-treasury\backend
npm test 2>&1 | head -50
```

Если тесты падают из-за изменения сигнатуры `getUSDCBalance` или `swapNEARtoUSDC`, обновить соответствующие тесты чтобы передавать `usdcContract` / config-объект. Пример для wallet.test.js:

Найти вызовы `getUSDCBalance(account)` и заменить на `getUSDCBalance(account, 'usdc.fakes.testnet')`.

- [ ] **Step 7: Запустить все тесты App 1**

```bash
cd E:\near_project\app1-crypto-treasury\backend
npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 8: Commit**

```bash
git add app1-crypto-treasury/backend/src/config.js app1-crypto-treasury/backend/src/wallet.js app1-crypto-treasury/backend/src/swap.js app1-crypto-treasury/backend/src/index.js
git commit -m "refactor: move hardcoded testnet contract addresses to config for mainnet readiness"
```

---

## Task 14: Валидация длины строк (L-5)

**Files:**
- Modify: `app2-fiat-settlement/backend/src/index.js`

- [ ] **Step 1: Добавить валидацию в POST /api/schools**

В `app2-fiat-settlement/backend/src/index.js`, в обработчике `app.post('/api/schools', ...)`:

Было:
```js
const { name, bank_details, currency } = req.body;
if (!name) return res.status(400).json({ error: 'name is required' });
```
Стало:
```js
const { name, bank_details, currency } = req.body;
if (!name) return res.status(400).json({ error: 'name is required' });
if (typeof name === 'string' && name.length > 200) {
  return res.status(400).json({ error: 'name must be 200 characters or less' });
}
if (bank_details && typeof bank_details === 'string' && bank_details.length > 500) {
  return res.status(400).json({ error: 'bank_details must be 500 characters or less' });
}
```

- [ ] **Step 2: Добавить валидацию в POST /api/payments**

Найти обработчик `app.post('/api/payments', ...)`, после проверки amount добавить:

```js
if (notes && typeof notes === 'string' && notes.length > 500) {
  return res.status(400).json({ error: 'notes must be 500 characters or less' });
}
```

- [ ] **Step 3: Запустить тесты App 2**

```bash
cd E:\near_project\app2-fiat-settlement\backend
npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Step 4: Commit**

```bash
git add app2-fiat-settlement/backend/src/index.js
git commit -m "feat: add string length validation for school name, bank_details, and notes"
```

---

## Финальная проверка

- [ ] **Запустить все тесты обоих приложений**

```bash
cd E:\near_project\app1-crypto-treasury\backend && npm test
cd E:\near_project\app2-fiat-settlement\backend && npm test
```

Ожидаемый результат: все тесты PASS.

- [ ] **Проверить git status**

```bash
cd E:\near_project
git status
git log --oneline -15
```

- [ ] **Ротировать приватный ключ (C-1 — финальный шаг)**

```bash
near generate-key farab.testnet --networkId testnet
```

Скопировать `private_key` из `~/.near-credentials/testnet/farab.testnet.json` в `.env`.
