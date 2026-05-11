const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/test-db.db');

let db;
let dbModule;

beforeEach(() => {
  dbModule = require('../src/db');
  db = dbModule.initDb(TEST_DB);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  jest.resetModules();
});

describe('schools', () => {
  test('addSchool creates record with correct fields', () => {
    const school = dbModule.addSchool(db, { name: 'Test School', bank_details: 'IBAN123', currency: 'USD' });
    expect(school.id).toBeDefined();
    expect(school.name).toBe('Test School');
    expect(school.bank_details).toBe('IBAN123');
    expect(school.currency).toBe('USD');
  });

  test('getAllSchools returns all schools', () => {
    dbModule.addSchool(db, { name: 'School A', currency: 'USD' });
    dbModule.addSchool(db, { name: 'School B', currency: 'RUB' });
    expect(dbModule.getAllSchools(db)).toHaveLength(2);
  });

  test('deleteSchool throws if school has payments', () => {
    const school = dbModule.addSchool(db, { name: 'School', currency: 'USD' });
    dbModule.createPayment(db, { school_id: school.id, amount: 100, currency: 'USD' });
    expect(() => dbModule.deleteSchool(db, school.id)).toThrow('School has existing payments');
  });
});

describe('payments', () => {
  let school;
  beforeEach(() => {
    school = dbModule.addSchool(db, { name: 'Test School', currency: 'USD' });
  });

  test('createPayment defaults status to pending and app1_released to 0', () => {
    const payment = dbModule.createPayment(db, { school_id: school.id, amount: 200, currency: 'USD' });
    expect(payment.status).toBe('pending');
    expect(payment.app1_released).toBe(0);
    expect(payment.sent_at).toBeNull();
  });

  test('confirmPayment sets status to sent and records sent_at', () => {
    const payment = dbModule.createPayment(db, { school_id: school.id, amount: 200, currency: 'USD' });
    const confirmed = dbModule.confirmPayment(db, payment.id, { app1_released: true });
    expect(confirmed.status).toBe('sent');
    expect(confirmed.app1_released).toBe(1);
    expect(confirmed.sent_at).toBeTruthy();
  });
});

describe('schedules', () => {
  let school;
  beforeEach(() => {
    school = dbModule.addSchool(db, { name: 'Test School', currency: 'USD' });
  });

  test('createSchedule defaults active to 1', () => {
    const schedule = dbModule.createSchedule(db, {
      school_id: school.id, amount: 300, currency: 'USD', cron_expr: '0 9 1 * *',
    });
    expect(schedule.active).toBe(1);
    expect(schedule.cron_expr).toBe('0 9 1 * *');
  });

  test('toggleSchedule pauses and reactivates', () => {
    const schedule = dbModule.createSchedule(db, {
      school_id: school.id, amount: 300, currency: 'USD', cron_expr: '0 9 1 * *',
    });
    const paused = dbModule.toggleSchedule(db, schedule.id, false);
    expect(paused.active).toBe(0);
    const active = dbModule.toggleSchedule(db, schedule.id, true);
    expect(active.active).toBe(1);
  });
});
