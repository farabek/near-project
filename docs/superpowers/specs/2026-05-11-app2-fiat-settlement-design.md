# App 2: Fiat Settlement — Design Document

**Date:** 2026-05-11
**Project:** NEAR Sovereign AI Blueprint — Edu-Arbitrage Model
**Status:** Approved

---

## Context

The system consists of two apps:

- **App 1 (complete):** Crypto Treasury — manages funds in NEAR/USDC, deployed to `farab.testnet`
- **App 2 (this document):** Fiat Settlement — pays schools in fiat, manages schools and schedules

Key principles:

- Schools do not know about crypto — they receive a regular bank transfer
- Single user — the system owner
- Payment provider is a mock stub; real integration is added later
- Supports two business model modes: linked to App 1 (Mode A) and standalone (Mode B)

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                    App 2: Fiat Settlement                     │
│                                                              │
│  ┌────────────────────┐      ┌───────────────────────────┐   │
│  │   Express Backend  │      │   SQLite Database         │   │
│  │   (port 3001)      │─────▶│                           │   │
│  │                    │      │  schools       payments   │   │
│  │  /api/schools      │      │  schedules                │   │
│  │  /api/payments     │      └───────────────────────────┘   │
│  │  /api/schedules    │                                       │
│  └────────┬───────────┘                                       │
│           │                                                   │
│  ┌────────▼───────────┐      ┌───────────────────────────┐   │
│  │   Static Frontend  │      │   Mock Payment Module     │   │
│  │   (HTML/CSS/JS)    │      │   (stub, always OK)       │   │
│  └────────────────────┘      └───────────────────────────┘   │
│                                                              │
└──────────────────────┬───────────────────────────────────────┘
                       │  POST /api/release
                       │  Header: x-api-key
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    App 1: Crypto Treasury                     │
│                    (port 3000, farab.testnet)                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Approach

**JS-first, no frameworks:** Node.js/Express backend + static HTML/vanilla JS frontend + SQLite.

Chosen because:

- Consistent style with App 1 — single Node.js process, no build step
- SQLite requires no separate database server
- React is overkill for a single-owner system

---

## Components

| File | Description |
|------|-------------|
| `backend/src/index.js` | Express server, all routes |
| `backend/src/db.js` | SQLite: table creation, CRUD operations |
| `backend/src/payment.js` | Mock provider + App 1 `/api/release` call |
| `backend/src/scheduler.js` | Runs scheduled payments via cron |
| `backend/public/index.html` | Main dashboard |
| `backend/public/schools.html` | School management |
| `backend/public/payments.html` | Payment creation and history |
| `backend/public/schedules.html` | Schedule management |

---

## Data Model (SQLite)

### Table `schools`

```sql
CREATE TABLE schools (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  bank_details TEXT,
  currency    TEXT NOT NULL DEFAULT 'USD',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Table `payments`

```sql
CREATE TABLE payments (
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
```

Statuses: `pending` → `sent`

The `app1_payment_id` field is optional. If NULL — the payment proceeds without calling App 1 (Mode B).

The `app1_released` field is a flag: whether `/api/release` was successfully called on App 1. If the payment went through but App 1 was unavailable — the flag stays `0` and the owner sees a warning.

### Table `schedules`

```sql
CREATE TABLE schedules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id  INTEGER NOT NULL REFERENCES schools(id),
  amount     REAL NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'USD',
  cron_expr  TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`cron_expr` examples:

- `0 9 1 * *` — 1st of every month at 9:00
- `0 10 * * 1` — every Monday at 10:00

Any currency supported via ISO code (USD, RUB, EUR, GBP, UZS, etc.) — in all three tables.

---

## REST API

### Schools

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/schools` | List all schools |
| `POST` | `/api/schools` | Add a school |
| `PUT` | `/api/schools/:id` | Update details |
| `DELETE` | `/api/schools/:id` | Delete a school |

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/payments` | Payment history |
| `POST` | `/api/payments` | Create payment (status `pending`) |
| `POST` | `/api/payments/:id/confirm` | Confirm and send: mock → status `sent` → App 1 release |

### Schedules

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/schedules` | List schedules |
| `POST` | `/api/schedules` | Create a schedule |
| `PATCH` | `/api/schedules/:id` | Pause / activate |
| `DELETE` | `/api/schedules/:id` | Delete schedule |

---

## Payment Flow

```text
1. CREATE
   Owner → POST /api/payments { school_id, amount, currency, app1_payment_id? }
   → Record in DB, status: pending

2. REVIEW
   Owner checks details (school, amount, bank details) before confirming

3. CONFIRM
   Owner → POST /api/payments/:id/confirm
   → Mock provider: "sent" (always OK)
   → Status: sent, sent_at: now()
   → If app1_payment_id is set: POST http://localhost:3000/api/release
     { paymentId } with x-api-key header
   → app1_released: 1 (if OK) or 0 + warning (if App 1 unavailable)

4. SCHEDULE (optional)
   scheduler.js checks active schedule cron_expr every minute
   → On match, automatically creates a payment and calls confirm
   → app1_payment_id not set (Mode B — fiat payment without crypto link)
   → Owner sees the record in payment history
```

---

## Error Handling

| Situation | What happens |
|-----------|-------------|
| Mock provider returns error | Status stays `pending`, error in API response |
| App 1 unavailable on release | `sent` is recorded, `app1_released: 0`, warning in response |
| `app1_payment_id` not set | Payment proceeds without calling App 1 — Mode B |
| Double confirmation (`sent` → confirm again) | 400 Bad Request: "Payment already sent" |
| Deleting school with payments | 400 Bad Request: "School has existing payments" |

---

## Project Structure

```text
app2-fiat-settlement/
├── backend/
│   ├── src/
│   │   ├── index.js        # Express server, routes
│   │   ├── db.js           # SQLite: tables and CRUD
│   │   ├── payment.js      # Mock provider + App 1 release
│   │   └── scheduler.js    # Cron schedules
│   ├── public/
│   │   ├── index.html      # Dashboard
│   │   ├── schools.html    # School management
│   │   ├── payments.html   # Payments
│   │   └── schedules.html  # Schedules
│   ├── tests/
│   │   ├── db.test.js
│   │   ├── payment.test.js
│   │   ├── scheduler.test.js
│   │   └── api.test.js
│   ├── package.json
│   └── .env.example
└── .env
```

---

## Environment Variables

```bash
PORT=3001
APP1_URL=http://localhost:3000
APP1_RELEASE_API_KEY=<same key as in App 1>
DB_PATH=./data/app2.db
```

---

## Testing

Jest + supertest, same as App 1:

| File | Tests | Count |
|------|-------|-------|
| `db.test.js` | CRUD for schools, payments, schedules | ~6 |
| `payment.test.js` | Mock provider, App 1 call, error handling | ~5 |
| `scheduler.test.js` | Cron trigger logic, pause/activate | ~4 |
| `api.test.js` | All REST endpoints (supertest) | ~8 |

Target: ~23 tests.

---

## Next Steps

After App 2 is implemented:

- Replace mock provider with a real one (Wise API or similar)
- Add `.gitignore`, commit to GitHub
- Optionally: deploy App 1 + App 2 to a server (Railway, Render)
