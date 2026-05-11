# App 2: Fiat Settlement — Дизайн-документ

**Дата:** 2026-05-11
**Проект:** NEAR Sovereign AI Blueprint — Edu-Arbitrage Model
**Статус:** Одобрен

---

## Контекст

Система состоит из двух приложений:

- **App 1 (готов):** Crypto Treasury — управление средствами в NEAR/USDC, задеплоен на `farab.testnet`
- **App 2 (этот документ):** Fiat Settlement — выплаты школам в фиате, управление школами и расписаниями

Ключевые принципы:
- Школы не знают о крипте — получают обычный банковский перевод
- Только один пользователь — владелец системы
- Платёжный провайдер — заглушка (mock), реальная интеграция добавляется позже
- Поддержка двух режимов бизнес-модели: с привязкой к App 1 (режим А) и без неё (режим Б)

---

## Архитектура

```text
┌──────────────────────────────────────────────────────────────┐
│                    App 2: Fiat Settlement                     │
│                                                              │
│  ┌────────────────────┐      ┌───────────────────────────┐   │
│  │   Express Backend  │      │   SQLite Database         │   │
│  │   (порт 3001)      │─────▶│                           │   │
│  │                    │      │  schools       payments   │   │
│  │  /api/schools      │      │  schedules                │   │
│  │  /api/payments     │      └───────────────────────────┘   │
│  │  /api/schedules    │                                       │
│  └────────┬───────────┘                                       │
│           │                                                   │
│  ┌────────▼───────────┐      ┌───────────────────────────┐   │
│  │   Static Frontend  │      │   Mock Payment Module     │   │
│  │   (HTML/CSS/JS)    │      │   (заглушка, всегда OK)   │   │
│  └────────────────────┘      └───────────────────────────┘   │
│                                                              │
└──────────────────────┬───────────────────────────────────────┘
                       │  POST /api/release
                       │  Header: x-api-key
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    App 1: Crypto Treasury                     │
│                    (порт 3000, farab.testnet)                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Подход

**JS-first, без фреймворков:** Node.js/Express бэкенд + статический HTML/vanilla JS фронтенд + SQLite.

Выбран потому что:
- Единый стиль с App 1 — один Node.js процесс, никакого шага сборки
- SQLite не требует отдельного сервера базы данных
- Для единственного владельца React — избыточен

---

## Компоненты

| Файл | Что делает |
|------|------------|
| `backend/src/index.js` | Express сервер, все маршруты |
| `backend/src/db.js` | SQLite: создание таблиц, CRUD операции |
| `backend/src/payment.js` | Mock провайдер + вызов App 1 `/api/release` |
| `backend/src/scheduler.js` | Запуск запланированных выплат по cron |
| `backend/public/index.html` | Главный дашборд |
| `backend/public/schools.html` | Управление школами |
| `backend/public/payments.html` | Создание и история выплат |
| `backend/public/schedules.html` | Управление расписаниями |

---

## Модель данных (SQLite)

### Таблица `schools`

```sql
CREATE TABLE schools (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  bank_details TEXT,
  currency    TEXT NOT NULL DEFAULT 'USD',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Таблица `payments`

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

Статусы: `pending` → `sent`

Поле `app1_payment_id` — необязательное. Если NULL — выплата проходит без вызова App 1 (режим Б бизнес-модели).

Поле `app1_released` — флаг: был ли успешно вызван `/api/release` на App 1. Если выплата прошла, но App 1 недоступен — флаг остаётся `0` и владелец видит предупреждение.

### Таблица `schedules`

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

`cron_expr` примеры:
- `0 9 1 * *` — 1-го числа каждого месяца в 9:00
- `0 10 * * 1` — каждый понедельник в 10:00

Поддержка любой валюты через ISO-код (USD, RUB, EUR, GBP, UZS и др.) — во всех трёх таблицах.

---

## REST API

### Школы

| Метод | Эндпоинт | Что делает |
|-------|----------|------------|
| `GET` | `/api/schools` | Список всех школ |
| `POST` | `/api/schools` | Добавить школу |
| `PUT` | `/api/schools/:id` | Обновить реквизиты |
| `DELETE` | `/api/schools/:id` | Удалить школу |

### Выплаты

| Метод | Эндпоинт | Что делает |
|-------|----------|------------|
| `GET` | `/api/payments` | История всех выплат |
| `POST` | `/api/payments` | Создать выплату (статус `pending`) |
| `POST` | `/api/payments/:id/confirm` | Подтвердить и отправить: mock → статус `sent` → App 1 release |

### Расписания

| Метод | Эндпоинт | Что делает |
|-------|----------|------------|
| `GET` | `/api/schedules` | Список расписаний |
| `POST` | `/api/schedules` | Создать расписание |
| `PATCH` | `/api/schedules/:id` | Пауза / активировать |
| `DELETE` | `/api/schedules/:id` | Удалить расписание |

---

## Поток выплаты

```text
1. СОЗДАНИЕ
   Владелец → POST /api/payments { school_id, amount, currency, app1_payment_id? }
   → Запись в БД, статус: pending

2. ПРОСМОТР
   Владелец проверяет детали (школа, сумма, реквизиты) перед подтверждением

3. ПОДТВЕРЖДЕНИЕ
   Владелец → POST /api/payments/:id/confirm
   → Mock провайдер: "отправлено" (всегда OK)
   → Статус: sent, sent_at: now()
   → Если app1_payment_id указан: POST http://localhost:3000/api/release
     { paymentId } с заголовком x-api-key
   → app1_released: 1 (если OK) или 0 + предупреждение (если App 1 недоступен)

4. РАСПИСАНИЕ (опционально)
   scheduler.js каждую минуту проверяет cron_expr активных расписаний
   → При совпадении автоматически создаёт выплату и сразу вызывает confirm
   → app1_payment_id не указывается (режим Б — выплата из фиата без привязки к крипте)
   → Владелец видит запись в истории выплат
```

---

## Обработка ошибок

| Ситуация | Что происходит |
|----------|----------------|
| Mock провайдер возвращает ошибку | Статус остаётся `pending`, ошибка в ответе API |
| App 1 недоступен при release | `sent` записывается, `app1_released: 0`, предупреждение в ответе |
| `app1_payment_id` не указан | Выплата проходит без вызова App 1 — режим Б |
| Двойное подтверждение (`sent` → confirm ещё раз) | 400 Bad Request: "Payment already sent" |
| Удаление школы с выплатами | 400 Bad Request: "School has existing payments" |

---

## Структура проекта

```text
app2-fiat-settlement/
├── backend/
│   ├── src/
│   │   ├── index.js        # Express сервер, маршруты
│   │   ├── db.js           # SQLite: таблицы и CRUD
│   │   ├── payment.js      # Mock провайдер + App 1 release
│   │   └── scheduler.js    # Cron расписания
│   ├── public/
│   │   ├── index.html      # Дашборд
│   │   ├── schools.html    # Управление школами
│   │   ├── payments.html   # Выплаты
│   │   └── schedules.html  # Расписания
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

## Переменные окружения

```bash
PORT=3001
APP1_URL=http://localhost:3000
APP1_RELEASE_API_KEY=<тот же ключ что в App 1>
DB_PATH=./data/app2.db
```

---

## Тестирование

Jest + supertest, аналогично App 1:

| Файл | Что тестирует | Кол-во тестов |
|------|---------------|---------------|
| `db.test.js` | CRUD школ, платежей, расписаний | ~6 |
| `payment.test.js` | Mock провайдер, вызов App 1, обработка ошибок | ~5 |
| `scheduler.test.js` | Логика запуска по cron, пауза/активация | ~4 |
| `api.test.js` | Все REST эндпоинты (supertest) | ~8 |

Цель: ~23 теста.

---

## Что дальше

После реализации App 2:
- Заменить mock провайдер на реального (Wise API или ЮKassa)
- Добавить `.gitignore`, закоммитить в GitHub
- Опционально: задеплоить App 1 + App 2 на сервер (Railway, Render)
