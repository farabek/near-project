# App 1: Crypto Treasury — Прогресс реализации

**Последнее обновление:** 2026-05-11

---

## Статус задач

| Task | Статус | Описание |
| ------ | -------- | ---------- |
| Task 1 | ✅ DONE | Scaffold Rust контракта |
| Task 2 | ✅ DONE | Data structures + lock_funds + get_payment + get_all_payments (5 тестов) |
| Task 3 | ✅ DONE | release_funds + access control (owner only) + 4 теста |
| Task 4 | ✅ DONE | Build WASM + Deploy на farab.testnet |
| Task 5 | ✅ DONE | Backend setup (package.json, config.js, .env.example) |
| Task 6 | ✅ DONE | wallet.js — loadAccount, getNEARBalance (2 теста) |
| Task 7 | ✅ DONE | escrow.js — lockFunds, releaseFunds, getPayment, getAllPayments (5 тестов) |
| Task 8 | ✅ DONE | swap.js — wrapNEAR, swapNEARtoUSDC (3 теста) |
| Task 9 | ✅ DONE | index.js — Express API, 6 эндпоинтов (14 тестов) |
| Task 10 | ✅ DONE | E2E тест пройден — lock → get → release → get (все OK) |

**Результат тестов:** 24/24 ✅ (escrow: 5, swap: 3, wallet: 2, api: 14)

---

## App 1 MVP — ЗАВЕРШЁН ✅

Контракт задеплоен на **farab.testnet** и полностью функционирует.

### Решение проблемы WASM (Task 4)

Цепочка инструментов:

1. Сборка: `cargo +1.86 build --target wasm32-unknown-unknown --release`
2. Постобработка: `wasm-opt -Oz --disable-bulk-memory --disable-reference-types --disable-sign-ext --disable-nontrapping-float-to-int --disable-multivalue -o escrow_opt.wasm escrow.wasm`
3. Деплой файла `escrow_opt.wasm`

Почему: near-sdk 5.5.0 + Rust 1.86 генерирует WASM с bulk-memory features, которые не поддерживаются NEAR VM на testnet protocol 83. wasm-opt убирает эти features из бинарника.

### Фикс viewFunction (escrow.js)

near-api-js 2.1.4 не передаёт `account_id` в RPC запросах viewFunction. Заменили на прямой вызов `provider.query({ request_type: 'call_function', account_id, ... })`.

---

## E2E тест — результаты (2026-05-10)

```text
GET  /api/balance         → { "near": "9.99" }             ✅
POST /api/lock            → { "success": true }             ✅
GET  /api/payments/pay_001 → { "status": "Locked" }        ✅
GET  /api/payments        → [{ pay_001, Locked }]           ✅
POST /api/release         → { "success": true }             ✅
GET  /api/payments/pay_001 → { "status": "Released" }      ✅
```

---

## Конфигурация деплоя

- **NEAR аккаунт:** `farab.testnet`
- **Contract ID:** `farab.testnet` (контракт задеплоен на основной аккаунт)
- **Сеть:** testnet
- **Rust toolchain:** 1.86 + wasm-opt (binaryen)
- **near-api-js:** 2.1.4

---

## Команды пересборки и деплоя

```powershell
# Сборка
cd E:\near_project\app1-crypto-treasury\contract
cargo +1.86 build --target wasm32-unknown-unknown --release

# Оптимизация
wasm-opt target\wasm32-unknown-unknown\release\escrow.wasm -Oz `
  --disable-bulk-memory --disable-reference-types `
  --disable-sign-ext --disable-nontrapping-float-to-int --disable-multivalue `
  -o target\wasm32-unknown-unknown\release\escrow_opt.wasm

# Деплой
$env:PATH += ";C:\Users\user\AppData\Local\Programs\near-cli\near-cli-rs-x86_64-pc-windows-msvc"
near contract deploy farab.testnet use-file "target\wasm32-unknown-unknown\release\escrow_opt.wasm" without-init-call network-config testnet sign-with-keychain send

# Инициализация (только при первом деплое)
[System.IO.File]::WriteAllText("$env:TEMP\init-args.json", '{"owner":"farab.testnet"}', (New-Object System.Text.UTF8Encoding $false))
near contract call-function as-transaction farab.testnet new file-args "$env:TEMP\init-args.json" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as farab.testnet network-config testnet sign-with-keychain send
```

---

## Запуск backend

```powershell
cd E:\near_project\app1-crypto-treasury\backend
npm start
# → App 1 Crypto Treasury running on port 3000
```

---

## Улучшения App 1 (в работе)

- [x] Добавить API key аутентификацию на `POST /api/release`
- [x] Добавить USDC баланс в `GET /api/balance` (через `ft_balance_of` на usdc.fakes.testnet)
- [x] Верифицировать Ref Finance pool ID — исправлен с 2 на **54** (usdc.fakes.testnet / wrap.testnet)

## Что дальше (App 2)

- [ ] Спроектировать App 2: Fiat Settlement + School Portal (через `/superpowers brainstorm`)

---

## Бизнес-модель

**Потоки денег:**

- Спонсоры / сам владелец → платят **NEAR/USDC** (крипта) → App 1 хранит
- Клиенты / компании → платят **фиат** (рубли, доллары) → владелец
- Владелец → платит школам **фиат** → App 2

**Два режима работы:**

- Режим А: крипта из App 1 конвертируется → фиат → выплата школе
- Режим Б: крипта живёт отдельно как резерв, школам платят из фиата клиентов

---

## Стратегия масштабирования

Контракт App 1 уже универсален — подходит для любого эскроу, не только образования.

### Вариант 1 — Уже сейчас (ничего менять не надо)

Использовать тот же контракт `farab.testnet`, менять префикс payment_id:

- `edu_001` — образование
- `shop_001` — товары
- `rent_001` — аренда

### Вариант 2 — Отдельный аккаунт на каждый проект

Деплоить тот же контракт на разные NEAR аккаунты:

- `farab.testnet` — Edu-Arbitrage
- `shop.farab.testnet` — магазин
- `rent.farab.testnet` — аренда

**Вариант 3 — Полноценная платформа**
Переписать как мультипроектную систему с кабинетами и ролями.
Только если система станет продуктом для других людей.

*Рекомендация: сейчас Вариант 1, при 2-3 реальных проектах — Вариант 2.*

---

## Ключевые файлы

| Файл | Что это |
| ------ | --------- |
| `docs/superpowers/specs/2026-05-05-crypto-treasury-design.md` | Дизайн-документ App 1 |
| `docs/superpowers/plans/2026-05-06-app1-crypto-treasury.md` | Пошаговый план (Tasks 1-10) |
| `app1-crypto-treasury/contract/src/lib.rs` | Rust смарт-контракт |
| `app1-crypto-treasury/contract/Cargo.toml` | near-sdk = "5.5.0" |
| `app1-crypto-treasury/backend/src/escrow.js` | Вызовы контракта (исправлен viewFunction) |
| `app1-crypto-treasury/backend/src/index.js` | Express API (6 эндпоинтов) |
| `app1-crypto-treasury/backend/.env` | Конфиг (не коммитить в git!) |
