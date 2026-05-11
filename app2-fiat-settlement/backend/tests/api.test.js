// Must set env before requiring any module that reads config
process.env.APP1_RELEASE_API_KEY = 'test-key';
process.env.APP1_URL = 'http://localhost:3099'; // nothing running — tests App 1 failure path
process.env.PORT = '3002';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/api-test.db');

let app;

beforeAll(() => {
  // Clean up any leftover DB from a previous run before opening
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  app = require('../src/index');
  app.initApp(TEST_DB);
});

afterAll(() => {
  app.closeDb();
  // Best-effort cleanup — may fail on Windows if handles linger; next run cleans up in beforeAll
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  } catch (_) { /* ignore lock errors on Windows */ }
});

describe('GET /api/schools', () => {
  test('returns empty array initially', async () => {
    const res = await request(app).get('/api/schools');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/schools', () => {
  test('creates a school and returns it', async () => {
    const res = await request(app)
      .post('/api/schools')
      .send({ name: 'Test School', bank_details: 'IBAN001', currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test School');
    expect(res.body.id).toBeDefined();
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/schools').send({ currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });
});

describe('POST /api/payments', () => {
  let schoolId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/schools')
      .send({ name: 'Payment Test School', currency: 'USD' });
    schoolId = res.body.id;
  });

  test('creates a payment with status pending', async () => {
    const res = await request(app)
      .post('/api/payments')
      .send({ school_id: schoolId, amount: 200, currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.amount).toBe(200);
  });

  test('returns 400 when amount is missing', async () => {
    const res = await request(app)
      .post('/api/payments')
      .send({ school_id: schoolId });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payments/:id/confirm', () => {
  let paymentId;
  let schoolId;

  beforeAll(async () => {
    const schoolRes = await request(app)
      .post('/api/schools')
      .send({ name: 'Confirm Test School', currency: 'USD' });
    schoolId = schoolRes.body.id;

    const paymentRes = await request(app)
      .post('/api/payments')
      .send({ school_id: schoolId, amount: 300, currency: 'USD' });
    paymentId = paymentRes.body.id;
  });

  test('confirms payment, sets status to sent', async () => {
    const res = await request(app).post(`/api/payments/${paymentId}/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment.status).toBe('sent');
  });

  test('returns 400 on double confirm', async () => {
    const res = await request(app).post(`/api/payments/${paymentId}/confirm`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already sent/i);
  });
});

describe('DELETE /api/schools/:id', () => {
  test('returns 400 when school has payments', async () => {
    const schoolRes = await request(app)
      .post('/api/schools')
      .send({ name: 'School With Payments', currency: 'USD' });
    await request(app)
      .post('/api/payments')
      .send({ school_id: schoolRes.body.id, amount: 50, currency: 'USD' });

    const res = await request(app).delete(`/api/schools/${schoolRes.body.id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/existing payments/i);
  });
});

describe('Schedules API', () => {
  let schoolId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/schools')
      .send({ name: 'Schedule School', currency: 'USD' });
    schoolId = res.body.id;
  });

  test('creates a schedule and returns it active', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({ school_id: schoolId, amount: 100, currency: 'USD', cron_expr: '0 9 1 * *' });
    expect(res.status).toBe(201);
    expect(res.body.active).toBe(1);
    expect(res.body.cron_expr).toBe('0 9 1 * *');
  });
});
