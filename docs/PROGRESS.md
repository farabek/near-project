# App 1: Crypto Treasury — Implementation Progress

**Last updated:** 2026-05-11

---

## Task Status

| Task | Status | Description |
| ------ | -------- | ---------- |
| Task 1 | ✅ DONE | Scaffold Rust contract |
| Task 2 | ✅ DONE | Data structures + lock_funds + get_payment + get_all_payments (5 tests) |
| Task 3 | ✅ DONE | release_funds + access control (owner only) + 4 tests |
| Task 4 | ✅ DONE | Build WASM + Deploy to farab.testnet |
| Task 5 | ✅ DONE | Backend setup (package.json, config.js, .env.example) |
| Task 6 | ✅ DONE | wallet.js — loadAccount, getNEARBalance (2 tests) |
| Task 7 | ✅ DONE | escrow.js — lockFunds, releaseFunds, getPayment, getAllPayments (5 tests) |
| Task 8 | ✅ DONE | swap.js — wrapNEAR, swapNEARtoUSDC (3 tests) |
| Task 9 | ✅ DONE | index.js — Express API, 6 endpoints (14 tests) |
| Task 10 | ✅ DONE | E2E test passed — lock → get → release → get (all OK) |

**Test results:** 24/24 ✅ (escrow: 5, swap: 3, wallet: 2, api: 14)

---

## App 1 MVP — COMPLETE ✅

Contract deployed to **farab.testnet** and fully functional.

### WASM Issue Resolution (Task 4)

Toolchain:

1. Build: `cargo +1.86 build --target wasm32-unknown-unknown --release`
2. Post-process: `wasm-opt -Oz --disable-bulk-memory --disable-reference-types --disable-sign-ext --disable-nontrapping-float-to-int --disable-multivalue -o escrow_opt.wasm escrow.wasm`
3. Deploy `escrow_opt.wasm`

Why: near-sdk 5.5.0 + Rust 1.86 generates WASM with bulk-memory features that are not supported by NEAR VM on testnet protocol 83. wasm-opt strips these features from the binary.

### viewFunction fix (escrow.js)

near-api-js 2.1.4 does not pass `account_id` in RPC viewFunction requests. Replaced with a direct call to `provider.query({ request_type: 'call_function', account_id, ... })`.

---

## E2E Test — Results (2026-05-10)

```text
GET  /api/balance         → { "near": "9.99" }             ✅
POST /api/lock            → { "success": true }             ✅
GET  /api/payments/pay_001 → { "status": "Locked" }        ✅
GET  /api/payments        → [{ pay_001, Locked }]           ✅
POST /api/release         → { "success": true }             ✅
GET  /api/payments/pay_001 → { "status": "Released" }      ✅
```

---

## Deploy Configuration

- **NEAR account:** `farab.testnet`
- **Contract ID:** `farab.testnet` (contract deployed to the main account)
- **Network:** testnet
- **Rust toolchain:** 1.86 + wasm-opt (binaryen)
- **near-api-js:** 2.1.4

---

## Build and Deploy Commands

```powershell
# Build
cd E:\near_project\app1-crypto-treasury\contract
cargo +1.86 build --target wasm32-unknown-unknown --release

# Optimize
wasm-opt target\wasm32-unknown-unknown\release\escrow.wasm -Oz `
  --disable-bulk-memory --disable-reference-types `
  --disable-sign-ext --disable-nontrapping-float-to-int --disable-multivalue `
  -o target\wasm32-unknown-unknown\release\escrow_opt.wasm

# Deploy
$env:PATH += ";C:\Users\user\AppData\Local\Programs\near-cli\near-cli-rs-x86_64-pc-windows-msvc"
near contract deploy farab.testnet use-file "target\wasm32-unknown-unknown\release\escrow_opt.wasm" without-init-call network-config testnet sign-with-keychain send

# Initialize (first deploy only)
[System.IO.File]::WriteAllText("$env:TEMP\init-args.json", '{"owner":"farab.testnet"}', (New-Object System.Text.UTF8Encoding $false))
near contract call-function as-transaction farab.testnet new file-args "$env:TEMP\init-args.json" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as farab.testnet network-config testnet sign-with-keychain send
```

---

## Running the Backend

```powershell
cd E:\near_project\app1-crypto-treasury\backend
npm start
# → App 1 Crypto Treasury running on port 3000
```

---

## App 1 Improvements (done)

- [x] Add API key authentication on `POST /api/release`
- [x] Add USDC balance to `GET /api/balance` (via `ft_balance_of` on usdc.fakes.testnet)
- [x] Verify Ref Finance pool ID — corrected from 2 to **54** (usdc.fakes.testnet / wrap.testnet)

## Next Steps (App 2)

- [ ] Design App 2: Fiat Settlement + School Portal (via `/superpowers brainstorm`)

---

## Business Model

**Money flows:**

- Sponsors / owner → pay **NEAR/USDC** (crypto) → App 1 holds it
- Clients / companies → pay **fiat** (USD, etc.) → owner
- Owner → pays schools in **fiat** → App 2

**Two operation modes:**

- Mode A: crypto from App 1 is converted → fiat → paid to school
- Mode B: crypto lives separately as reserve, schools are paid from client fiat

---

## Scaling Strategy

The App 1 contract is already universal — suitable for any escrow, not just education.

### Option 1 — Right Now (no changes needed)

Use the same `farab.testnet` contract, vary the payment_id prefix:

- `edu_001` — education
- `shop_001` — goods
- `rent_001` — rental

### Option 2 — Separate Account per Project

Deploy the same contract to different NEAR accounts:

- `farab.testnet` — Edu-Arbitrage
- `shop.farab.testnet` — store
- `rent.farab.testnet` — rental

**Option 3 — Full Platform**
Rewrite as a multi-project system with dashboards and roles.
Only needed if the system becomes a product for other people.

*Recommendation: Option 1 now; Option 2 when you have 2–3 real projects.*

---

## Key Files

| File | Description |
| ------ | --------- |
| `docs/superpowers/specs/2026-05-05-crypto-treasury-design.md` | App 1 design document |
| `docs/superpowers/plans/2026-05-06-app1-crypto-treasury.md` | Step-by-step plan (Tasks 1–10) |
| `app1-crypto-treasury/contract/src/lib.rs` | Rust smart contract |
| `app1-crypto-treasury/contract/Cargo.toml` | near-sdk = "5.5.0" |
| `app1-crypto-treasury/backend/src/escrow.js` | Contract calls (viewFunction fix) |
| `app1-crypto-treasury/backend/src/index.js` | Express API (6 endpoints) |
| `app1-crypto-treasury/backend/.env` | Config (do not commit to git!) |
