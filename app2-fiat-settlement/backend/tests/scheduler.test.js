const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/scheduler-test.db');

let db;
let dbModule;
let schedulerModule;

beforeEach(() => {
  jest.resetModules();
  dbModule = require('../src/db');
  schedulerModule = require('../src/scheduler');
  db = dbModule.initDb(TEST_DB);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

const testConfig = { app1Url: 'http://localhost:3099', app1ApiKey: 'test' };

describe('runScheduledPayment', () => {
  test('creates payment and confirms it with status sent', async () => {
    const school = dbModule.addSchool(db, { name: 'School', currency: 'USD' });
    const schedule = { id: 1, school_id: school.id, amount: 150, currency: 'EUR' };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    const payments = dbModule.getAllPayments(db);
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('sent');
    expect(payments[0].amount).toBe(150);
    expect(payments[0].currency).toBe('EUR');
    expect(payments[0].app1_released).toBe(0);
    expect(payments[0].app1_payment_id).toBeNull();
  });

  test('records sent_at timestamp after running', async () => {
    const school = dbModule.addSchool(db, { name: 'School', currency: 'USD' });
    const schedule = { id: 1, school_id: school.id, amount: 100, currency: 'USD' };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    const payments = dbModule.getAllPayments(db);
    expect(payments[0].sent_at).toBeTruthy();
  });
});

describe('registerSchedule / unregisterSchedule', () => {
  test('registers a schedule without throwing', () => {
    const schedule = { id: 99, school_id: 1, amount: 100, currency: 'USD', cron_expr: '0 9 1 * *' };
    expect(() => schedulerModule.registerSchedule(db, testConfig, schedule)).not.toThrow();
    schedulerModule.unregisterSchedule(99);
  });

  test('unregistering a non-existent schedule does not throw', () => {
    expect(() => schedulerModule.unregisterSchedule(9999)).not.toThrow();
  });
});
