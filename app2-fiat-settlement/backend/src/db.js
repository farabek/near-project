const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function initDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

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
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id        INTEGER NOT NULL REFERENCES schools(id),
      app1_payment_id  TEXT,
      amount           REAL NOT NULL,
      currency         TEXT NOT NULL DEFAULT 'USD',
      cron_expr        TEXT NOT NULL,
      active           INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
  if (!getSchool(db, id)) throw new Error('School not found');
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
  const paymentCount = db.prepare('SELECT COUNT(*) as c FROM payments WHERE school_id = ?').get(id).c;
  if (paymentCount > 0) throw new Error('School has existing payments');
  const scheduleCount = db.prepare('SELECT COUNT(*) as c FROM schedules WHERE school_id = ?').get(id).c;
  if (scheduleCount > 0) throw new Error('School has existing schedules');
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
  if (!getPayment(db, id)) throw new Error('Payment not found');
  db.prepare(`
    UPDATE payments
    SET status = 'sent', sent_at = datetime('now'), app1_released = ?
    WHERE id = ?
  `).run(app1_released ? 1 : 0, id);
  return getPayment(db, id);
}

// ─── Schedules ────────────────────────────────────────────────────────────────

function createSchedule(db, { school_id, app1_payment_id, amount, currency = 'USD', cron_expr }) {
  const result = db.prepare(
    'INSERT INTO schedules (school_id, app1_payment_id, amount, currency, cron_expr) VALUES (?, ?, ?, ?, ?)'
  ).run(school_id, app1_payment_id || null, amount, currency, cron_expr);
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
