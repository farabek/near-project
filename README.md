# NEAR Edu-Arbitrage

A two-app system for managing fiat payments to schools via a crypto treasury on the NEAR blockchain.

**Status:** Both apps ready ✅ (NEAR testnet, `farab.testnet`)

---

## Architecture Overview

```text
Sponsors / Clients
        │
        ▼
┌───────────────────┐       ┌───────────────────────┐
│  App 1            │  API  │  App 2                │
│  Crypto Treasury  │◀─────▶│  Fiat Settlement      │
│  (port 3000)      │release│  (port 3001)          │
│                   │       │                       │
│  NEAR / USDC      │       │  Schools / Payments   │
│  Escrow on NEAR   │       │  Schedules / SQLite   │
└───────────────────┘       └───────────────────────┘
        │
        ▼
NEAR testnet (farab.testnet)
Rust smart contract
```

**Flow:**

- App 1 holds USDC in escrow on the blockchain
- App 2 manages school payments in fiat (mock provider)
- When a payment is confirmed, App 2 calls App 1 → USDC is released

---

## Repository Structure

```text
near-project/
├── app1-crypto-treasury/
│   ├── contract/           ← Rust smart contract (near-sdk 5.5.0)
│   └── backend/            ← Node.js/Express API (port 3000)
├── app2-fiat-settlement/
│   └── backend/
│       ├── src/            ← Express API (port 3001)
│       ├── public/         ← Owner HTML dashboard
│       └── tests/          ← 31 tests
└── docs/
    └── superpowers/
        ├── specs/          ← Design documents
        └── plans/          ← Implementation plans
```

---

## Quick Start

### App 1 — Crypto Treasury

```powershell
cd app1-crypto-treasury/backend
npm install
# Copy .env.example to .env and fill in your values
npm start
# → App 1 Crypto Treasury running on port 3000
```

### App 2 — Fiat Settlement

```powershell
cd app2-fiat-settlement/backend
npm install
# Copy .env.example to .env and fill in your values
node src/index.js
# → App 2 Fiat Settlement running on port 3001
```

Open `http://localhost:3001` — owner dashboard.

---

## Environment Variables

**App 1** (`app1-crypto-treasury/backend/.env`):

```env
NEAR_ACCOUNT_ID=farab.testnet
NEAR_PRIVATE_KEY=ed25519:...
NEAR_CONTRACT_ID=farab.testnet
NEAR_NETWORK=testnet
PORT=3000
RELEASE_API_KEY=your_strong_secret_key_here
```

**App 2** (`app2-fiat-settlement/.env`):

```env
PORT=3001
APP1_URL=http://localhost:3000
APP1_RELEASE_API_KEY=your_app1_release_key_here
ADMIN_API_KEY=your_strong_admin_key_here
DB_PATH=./data/app2.db
```

---

## API

### App 1 (port 3000)

| Method | Endpoint | Description |
| ------- | ---------- | ---------- |
| `GET` | `/api/balance` | NEAR + USDC balance |
| `POST` | `/api/lock` | Lock USDC `{ paymentId, amountUsdc }` |
| `POST` | `/api/release` | Release `{ paymentId }` + `x-api-key` |
| `GET` | `/api/payments` | All payments |
| `GET` | `/api/payments/:id` | Single payment |
| `POST` | `/api/swap` | NEAR → USDC (Ref Finance) |

### App 2 (port 3001)

| Method | Endpoint | Description |
| ------- | ---------- | ---------- |
| `GET/POST` | `/api/schools` | List / add school |
| `PUT/DELETE` | `/api/schools/:id` | Update / delete |
| `GET/POST` | `/api/payments` | History / create payment |
| `POST` | `/api/payments/:id/confirm` | Confirm and send |
| `GET/POST` | `/api/schedules` | List / create schedule |
| `PATCH/DELETE` | `/api/schedules/:id` | Pause / delete |

---

## Tests

```powershell
# App 1
cd app1-crypto-treasury/backend && npm test
# → 28/28 ✅

# App 2
cd app2-fiat-settlement/backend && npx jest --no-coverage
# → 31/31 ✅
```

---

## Stack

| | App 1 | App 2 |
| -- | ------- | ------- |
| **Backend** | Node.js, Express 4 | Node.js, Express 4 |
| **DB** | NEAR blockchain | SQLite (better-sqlite3) |
| **Contract** | Rust, near-sdk 5.5.0 | — |
| **Scheduling** | — | node-cron |
| **Frontend** | — | Vanilla HTML/JS |
| **Tests** | Jest + supertest | Jest + supertest |

---

## Known Issues

**WASM compatibility:** NEAR testnet protocol 83 is incompatible with bulk-memory WASM. The contract is built with Rust 1.86 + `wasm-opt` post-processing with `--disable-bulk-memory --disable-reference-types` flags.

**near-api-js viewFunction:** version 2.1.4 does not pass `account_id` in view calls. `escrow.js` uses a direct `account.connection.provider.query(...)` call instead.

**App 1 release timeout:** NEAR testnet sometimes takes longer than 10 seconds to respond. App 2 shows a warning but marks the payment as `sent`. The NEAR transaction completes asynchronously.

---

## Documentation

- [App 1 design](docs/superpowers/specs/2026-05-05-crypto-treasury-design.md)
- [App 2 design](docs/superpowers/specs/2026-05-11-app2-fiat-settlement-design.md)
- [Project progress](docs/PROGRESS.md)
