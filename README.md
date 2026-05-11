# NEAR Edu-Arbitrage

Двухприложенческая система для управления фиатными выплатами школам через крипто-казну на NEAR блокчейне.

**Статус:** Оба приложения готовы ✅ (NEAR testnet, `farab.testnet`)

---

## Общая архитектура

```text
Спонсоры / Клиенты
        │
        ▼
┌───────────────────┐       ┌───────────────────────┐
│  App 1            │  API  │  App 2                │
│  Crypto Treasury  │◀─────▶│  Fiat Settlement      │
│  (порт 3000)      │release│  (порт 3001)          │
│                   │       │                       │
│  NEAR / USDC      │       │  Школы / Выплаты      │
│  Эскроу на NEAR   │       │  Расписания / SQLite  │
└───────────────────┘       └───────────────────────┘
        │
        ▼
NEAR testnet (farab.testnet)
Rust смарт-контракт
```

**Логика:**

- App 1 хранит USDC в эскроу на блокчейне
- App 2 управляет выплатами школам в фиате (mock провайдер)
- При подтверждении выплаты App 2 вызывает App 1 → USDC разблокируется

---

## Структура репозитория

```text
near-project/
├── app1-crypto-treasury/
│   ├── contract/           ← Rust смарт-контракт (near-sdk 5.5.0)
│   └── backend/            ← Node.js/Express API (порт 3000)
├── app2-fiat-settlement/
│   └── backend/
│       ├── src/            ← Express API (порт 3001)
│       ├── public/         ← HTML интерфейс владельца
│       └── tests/          ← 31 тест
└── docs/
    └── superpowers/
        ├── specs/          ← Дизайн-документы
        └── plans/          ← Планы реализации
```

---

## Быстрый старт

### App 1 — Crypto Treasury

```powershell
cd app1-crypto-treasury/backend
npm install
# Создать .env по шаблону .env.example
npm start
# → App 1 Crypto Treasury running on port 3000
```

### App 2 — Fiat Settlement

```powershell
cd app2-fiat-settlement/backend
npm install
# Создать .env по шаблону .env.example
node src/index.js
# → App 2 Fiat Settlement running on port 3001
```

Открыть `http://localhost:3001` — дашборд владельца.

---

## Переменные окружения

**App 1** (`app1-crypto-treasury/backend/.env`):

```env
NEAR_ACCOUNT_ID=farab.testnet
NEAR_PRIVATE_KEY=ed25519:...
NEAR_CONTRACT_ID=farab.testnet
NEAR_NETWORK=testnet
PORT=3000
RELEASE_API_KEY=app2-secret-key-change-in-production
```

**App 2** (`app2-fiat-settlement/.env`):

```env
PORT=3001
APP1_URL=http://localhost:3000
APP1_RELEASE_API_KEY=app2-secret-key-change-in-production
DB_PATH=./data/app2.db
```

---

## API

### App 1 (порт 3000)

| Метод | Эндпоинт | Описание |
| ------- | ---------- | ---------- |
| `GET` | `/api/balance` | NEAR + USDC баланс |
| `POST` | `/api/lock` | Заблокировать USDC `{ paymentId, amountUsdc }` |
| `POST` | `/api/release` | Разблокировать `{ paymentId }` + `x-api-key` |
| `GET` | `/api/payments` | Все платежи |
| `GET` | `/api/payments/:id` | Один платёж |
| `POST` | `/api/swap` | NEAR → USDC (Ref Finance) |

### App 2 (порт 3001)

| Метод | Эндпоинт | Описание |
| ------- | ---------- | ---------- |
| `GET/POST` | `/api/schools` | Список / добавить школу |
| `PUT/DELETE` | `/api/schools/:id` | Обновить / удалить |
| `GET/POST` | `/api/payments` | История / создать выплату |
| `POST` | `/api/payments/:id/confirm` | Подтвердить и отправить |
| `GET/POST` | `/api/schedules` | Список / создать расписание |
| `PATCH/DELETE` | `/api/schedules/:id` | Пауза / удалить |

---

## Тесты

```powershell
# App 1
cd app1-crypto-treasury/backend && npm test
# → 28/28 ✅

# App 2
cd app2-fiat-settlement/backend && npx jest --no-coverage
# → 31/31 ✅
```

---

## Стек

| | App 1 | App 2 |
| -- | ------- | ------- |
| **Бэкенд** | Node.js, Express 4 | Node.js, Express 4 |
| **БД** | NEAR blockchain | SQLite (better-sqlite3) |
| **Контракт** | Rust, near-sdk 5.5.0 | — |
| **Расписания** | — | node-cron |
| **Фронтенд** | — | Vanilla HTML/JS |
| **Тесты** | Jest + supertest | Jest + supertest |

---

## Известные особенности

**WASM совместимость:** NEAR testnet protocol 83 несовместим с bulk-memory WASM. Контракт собирается с Rust 1.86 + постобработка `wasm-opt` с флагами `--disable-bulk-memory --disable-reference-types`.

**near-api-js viewFunction:** версия 2.1.4 не передаёт `account_id` в view calls. В `escrow.js` используется прямой вызов `account.connection.provider.query(...)`.

**App 1 release timeout:** NEAR testnet иногда отвечает дольше 10 секунд. App 2 показывает предупреждение, но выплата помечается `sent`. Транзакция на NEAR при этом проходит асинхронно.

---

## Документация

- [App 1 дизайн](docs/superpowers/specs/2026-05-05-crypto-treasury-design.md)
- [App 2 дизайн](docs/superpowers/specs/2026-05-11-app2-fiat-settlement-design.md)
- [Прогресс проекта](docs/PROGRESS.md)
