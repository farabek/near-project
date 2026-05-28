jest.mock('../src/payment', () => ({
  mockSendPayment: jest.fn().mockResolvedValue({ success: true, ref: 'mock_ref' }),
  releaseApp1: jest.fn(),
}));

const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/scheduler-test.db');

let db;
let dbModule;
let schedulerModule;
let paymentModule;

beforeEach(() => {
  jest.resetModules();
  jest.mock('../src/payment', () => ({
    mockSendPayment: jest.fn().mockResolvedValue({ success: true, ref: 'mock_ref' }),
    releaseApp1: jest.fn(),
  }));
  dbModule = require('../src/db');
  schedulerModule = require('../src/scheduler');
  paymentModule = require('../src/payment');
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

  test('calls releaseApp1 when app1_payment_id is set and sets app1_released=1', async () => {
    paymentModule.releaseApp1.mockResolvedValue({ success: true });
    const school = dbModule.addSchool(db, { name: 'School', currency: 'USD' });
    const schedule = {
      id: 1, school_id: school.id, amount: 100, currency: 'USD', app1_payment_id: 'pay_001',
    };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    expect(paymentModule.releaseApp1).toHaveBeenCalledWith(
      testConfig.app1Url, testConfig.app1ApiKey, 'pay_001'
    );
    const payments = dbModule.getAllPayments(db);
    expect(payments[0].app1_released).toBe(1);
  });

  test('sets app1_released=0 when releaseApp1 fails', async () => {
    paymentModule.releaseApp1.mockRejectedValue(new Error('App 1 down'));
    const school = dbModule.addSchool(db, { name: 'School2', currency: 'USD' });
    const schedule = {
      id: 2, school_id: school.id, amount: 50, currency: 'USD', app1_payment_id: 'pay_002',
    };

    await schedulerModule.runScheduledPayment(db, testConfig, schedule);

    const payments = dbModule.getAllPayments(db);
    expect(payments[0].app1_released).toBe(0);
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
