# App 1: Crypto Treasury — Design Document

**Date:** 2026-05-05
**Project:** NEAR Sovereign AI Blueprint — Edu-Arbitrage Model
**Status:** Approved

---

## Context

The system consists of two apps:

- **App 1 (this document):** Crypto Treasury — manages funds in NEAR/USDC
- **App 2 (next phase):** Fiat Settlement — pays schools in fiat

Key requirement: schools must not know that the system operates with cryptocurrency. The crypto layer is fully hidden inside App 1.

---

## Approach

**JS-first:** Node.js/Express backend + near-api-js + one simple Rust smart contract.

Chosen because:

- The developer knows JS/Node.js — minimal new knowledge required
- NEAR provides ready-made Rust contract templates
- Fast path to a working MVP

**Network:** NEAR Testnet (initially)

---

## Architecture

```text
┌─────────────────────────────────────────────┐
│              App 1: Crypto Treasury          │
│                                             │
│  ┌──────────────┐    ┌──────────────────┐   │
│  │  Node.js API │    │  Rust Smart      │   │
│  │  (Express)   │───▶│  Contract        │   │
│  │              │    │  (Escrow)        │   │
│  └──────┬───────┘    └──────────────────┘   │
│         │                                   │
│  ┌──────▼───────┐    ┌──────────────────┐   │
│  │ near-api-js  │───▶│  Ref Finance     │   │
│  │ (NEAR SDK)   │    │  (NEAR→USDC swap)│   │
│  └──────────────┘    └──────────────────┘   │
│                                             │
│            NEAR Testnet                     │
└─────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
  Investors/Grants            App 2 (Fiat)
  (NEAR in)                   (USDC out)
```

### Modules

| Module | File | Description |
| --- | --- | --- |
| Wallet Manager | `backend/src/wallet.js` | Creates NEAR account, shows NEAR/USDC balance |
| Swap Module | `backend/src/swap.js` | Converts NEAR→USDC via Ref Finance |
| Escrow Contract | `contract/src/lib.rs` | Locks USDC, releases only on command from App 2 |
| REST API | `backend/src/index.js` | Endpoints for App 2 |

---

## Data Flow

```text
1. RECEIVE
   Investor/Grant → NEAR tokens → Wallet Manager (App 1 testnet account)

2. CONVERT
   Wallet Manager → Ref Finance API → NEAR→USDC → USDC on balance

3. LOCK
   Swap Module → Escrow Contract → USDC locked, payment_id created → Status: LOCKED

4. RELEASE (triggered by App 2)
   App 2: "school received $" → POST /api/release {payment_id}
   → Escrow Contract → USDC released → Off-ramp provider
```

**Key principle:** USDC never leaves automatically — only after explicit confirmation from App 2. Protection against errors and fraud.

---

## REST API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/balance` | NEAR and USDC balance |
| `POST` | `/api/swap` | Convert NEAR→USDC |
| `POST` | `/api/lock` | Lock USDC in escrow |
| `POST` | `/api/release` | Release USDC (called by App 2) |
| `GET` | `/api/payments` | Payment history |

---

## Project Structure

```text
app1-crypto-treasury/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express server
│   │   ├── wallet.js         # Wallet Manager
│   │   ├── swap.js           # Swap Module (Ref Finance)
│   │   └── escrow.js         # Smart contract calls
│   └── package.json
│
├── contract/
│   ├── src/
│   │   └── lib.rs            # Rust escrow contract
│   └── Cargo.toml
│
└── .env                      # NEAR account, keys, testnet config
```

---

## Smart Contract (Rust)

Three functions:

```rust
lock_funds(payment_id: String, amount_usdc: u128)  // lock
release_funds(payment_id: String)                   // release
get_payment(payment_id: String) -> PaymentStatus    // check status
```

Payment statuses: `LOCKED` → `RELEASED`

---

## Error Handling

| Situation | What happens |
| --- | --- |
| Swap failed (slippage) | NEAR stays on balance, error in API response |
| Contract unavailable | Transaction not sent, status `PENDING` |
| App 2 sent wrong `payment_id` | Contract rejects, USDC stays locked |
| Double `release` call | Contract checks status — duplicate call is ignored |

---

## Testing

1. Get test NEAR via NEAR Testnet Faucet (free)
2. Deploy contract to testnet account
3. Test each endpoint via Postman or curl
4. Verify full cycle: `swap → lock → release`

---

## Environment Variables

```bash
NEAR_ACCOUNT_ID=myapp.testnet
NEAR_PRIVATE_KEY=ed25519:...
NEAR_CONTRACT_ID=escrow.myapp.testnet
NEAR_NETWORK=testnet
```

---

## Next Steps

After App 1 MVP → design App 2 (Fiat Settlement & School Portal):

- Node.js/React
- Integration with payment provider (Wise/Airwallex)
- Owner dashboard for schools (without mentioning crypto)
- REST API for receiving commands from App 1
