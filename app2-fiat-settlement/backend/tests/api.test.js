// Must set env before requiring any module that reads config
process.env.APP1_RELEASE_API_KEY = 'test-key';
process.env.ADMIN_API_KEY = 'test-admin-key';
process.env.APP1_URL = 'http://localhost:3099'; // nothing running — tests App 1 failure path
process.env.PORT = '3002';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '../data/api-test.db');
const ADMIN_KEY = 'test-admin-key';

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

describe('Authentication middleware', () => {
  test('POST /api/schools returns 401 without API key', async () => {
    const res = await request(app).post('/api/schools').send({ name: 'Hack' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  test('DELETE /api/schools/:id returns 401 without API key', async () => {
    const res = await request(app).delete('/api/schools/1');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  test('POST /api/payments returns 401 without API key', async () => {
    const res = await request(app).post('/api/payments').send({ school_id: 1, amount: 100 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  test('POST /api/payments/:id/confirm returns 401 without API key', async () => {
    const res = await request(app).post('/api/payments/1/confirm');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });
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
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'Test School', bank_details: 'IBAN001', currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test School');
    expect(res.body.id).toBeDefined();
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });
});

describe('POST /api/payments', () => {
  let schoolId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'Payment Test School', currency: 'USD' });
    schoolId = res.body.id;
  });

  test('creates a payment with status pending', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 200, currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.amount).toBe(200);
  });

  test('returns 400 when amount is missing', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId });
    expect(res.status).toBe(400);
  });

  test('returns 400 when amount is a string', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 'abc', currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/i);
  });

  test('returns 400 when amount is negative', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: -50, currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/i);
  });

  test('returns 400 when amount is fractional', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 99.5, currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/i);
  });
});

describe('POST /api/payments/:id/confirm', () => {
  let paymentId;
  let schoolId;

  beforeAll(async () => {
    const schoolRes = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'Confirm Test School', currency: 'USD' });
    schoolId = schoolRes.body.id;

    const paymentRes = await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 300, currency: 'USD' });
    paymentId = paymentRes.body.id;
  });

  test('confirms payment, sets status to sent', async () => {
    const res = await request(app)
      .post(`/api/payments/${paymentId}/confirm`)
      .set('x-api-key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment.status).toBe('sent');
  });

  test('returns 400 on double confirm', async () => {
    const res = await request(app)
      .post(`/api/payments/${paymentId}/confirm`)
      .set('x-api-key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already sent/i);
  });
});

describe('DELETE /api/schools/:id', () => {
  test('returns 400 when school has payments', async () => {
    const schoolRes = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'School With Payments', currency: 'USD' });
    await request(app)
      .post('/api/payments')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolRes.body.id, amount: 50, currency: 'USD' });

    const res = await request(app)
      .delete(`/api/schools/${schoolRes.body.id}`)
      .set('x-api-key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/existing payments/i);
  });
});

describe('Schedules API', () => {
  let schoolId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/schools')
      .set('x-api-key', ADMIN_KEY)
      .send({ name: 'Schedule School', currency: 'USD' });
    schoolId = res.body.id;
  });

  test('creates a schedule and returns it active', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 100, currency: 'USD', cron_expr: '0 9 1 * *' });
    expect(res.status).toBe(201);
    expect(res.body.active).toBe(1);
    expect(res.body.cron_expr).toBe('0 9 1 * *');
  });

  test('returns 400 for invalid cron_expr', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 100, currency: 'USD', cron_expr: 'not-a-cron' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid cron/i);
  });

  test('returns 400 when schedule amount is non-numeric', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set('x-api-key', ADMIN_KEY)
      .send({ school_id: schoolId, amount: 'abc', currency: 'USD', cron_expr: '0 9 1 * *' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/i);
  });
});
