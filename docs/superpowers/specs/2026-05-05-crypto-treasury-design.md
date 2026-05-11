# App 1: Crypto Treasury — Дизайн-документ

**Дата:** 2026-05-05
**Проект:** NEAR Sovereign AI Blueprint — Edu-Arbitrage Model
**Статус:** Одобрен

---

## Контекст

Система состоит из двух приложений:

- **App 1 (этот документ):** Crypto Treasury — управление средствами в NEAR/USDC
- **App 2 (следующий этап):** Fiat Settlement — выплаты школам в долларах

Ключевое требование: школы не должны знать, что система работает с криптовалютой. Крипто-слой полностью скрыт внутри App 1.

---

## Подход

**JS-first:** Node.js/Express backend + near-api-js + один простой смарт-контракт на Rust.

Выбран потому что:

- Пользователь знает JS/Node.js — минимум нового
- NEAR предоставляет готовые шаблоны Rust-контрактов
- Быстрый путь к рабочему MVP

**Сеть:** NEAR Testnet (на старте)

---

## Архитектура

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
  Инвесторы/Гранты           App 2 (Fiat)
  (NEAR входит)              (USDC выходит)
```

### Модули

| Модуль | Файл | Что делает |
| --- | --- | --- |
| Wallet Manager | `backend/src/wallet.js` | Создаёт NEAR аккаунт, показывает баланс NEAR/USDC |
| Swap Module | `backend/src/swap.js` | Конвертирует NEAR→USDC через Ref Finance |
| Escrow Contract | `contract/src/lib.rs` | Блокирует USDC, отдаёт только по команде из App 2 |
| REST API | `backend/src/index.js` | Эндпоинты для App 2 |

---

## Поток данных

```text
1. ПОЛУЧЕНИЕ
   Инвестор/Грант → NEAR токены → Wallet Manager (App 1 testnet аккаунт)

2. КОНВЕРТАЦИЯ
   Wallet Manager → Ref Finance API → NEAR→USDC → USDC на балансе

3. БЛОКИРОВКА
   Swap Module → Escrow Contract → USDC заблокирован, payment_id создан → Статус: LOCKED

4. РАЗБЛОКИРОВКА (триггер из App 2)
   App 2: "школа получила $" → POST /api/release {payment_id}
   → Escrow Contract → USDC разблокирован → Off-ramp провайдер
```

**Ключевой принцип:** USDC никогда не уходит автоматически — только после явного подтверждения из App 2. Защита от ошибок и мошенничества.

---

## REST API

| Метод | Эндпоинт | Что делает |
| --- | --- | --- |
| `GET` | `/api/balance` | Баланс NEAR и USDC |
| `POST` | `/api/swap` | Конвертировать NEAR→USDC |
| `POST` | `/api/lock` | Заблокировать USDC в эскроу |
| `POST` | `/api/release` | Разблокировать USDC (вызов из App 2) |
| `GET` | `/api/payments` | История всех платежей |

---

## Структура проекта

```text
app1-crypto-treasury/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express сервер
│   │   ├── wallet.js         # Wallet Manager
│   │   ├── swap.js           # Swap Module (Ref Finance)
│   │   └── escrow.js         # Вызовы смарт-контракта
│   └── package.json
│
├── contract/
│   ├── src/
│   │   └── lib.rs            # Rust эскроу-контракт
│   └── Cargo.toml
│
└── .env                      # NEAR аккаунт, ключи, testnet config
```

---

## Смарт-контракт (Rust)

Три функции:

```rust
lock_funds(payment_id: String, amount_usdc: u128)  // заблокировать
release_funds(payment_id: String)                   // разблокировать
get_payment(payment_id: String) -> PaymentStatus    // проверить статус
```

Статусы платежа: `LOCKED` → `RELEASED`

---

## Обработка ошибок

| Ситуация | Что происходит |
| --- | --- |
| Swap не прошёл (slippage) | NEAR остаётся на балансе, ошибка в ответе API |
| Контракт недоступен | Транзакция не отправляется, статус `PENDING` |
| App 2 прислал неверный `payment_id` | Контракт отклоняет, USDC остаётся заблокированным |
| Двойной вызов `release` | Контракт проверяет статус — повторный вызов игнорируется |

---

## Тестирование

1. Получить тестовые NEAR через NEAR Testnet Faucet (бесплатно)
2. Задеплоить контракт на testnet аккаунт
3. Тестировать каждый эндпоинт через Postman или curl
4. Проверить полный цикл: `swap → lock → release`

---

## Переменные окружения

```bash
NEAR_ACCOUNT_ID=myapp.testnet
NEAR_PRIVATE_KEY=ed25519:...
NEAR_CONTRACT_ID=escrow.myapp.testnet
NEAR_NETWORK=testnet
```

---

## Что дальше

После MVP App 1 → проектируем App 2 (Fiat Settlement & School Portal):

- Node.js/React
- Интеграция с платёжным провайдером (Wise/Airwallex)
- Личный кабинет для школ (без упоминания крипты)
- REST API для получения команд от App 1
