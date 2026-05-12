const request = require('supertest');

// Мокаем все зависимости ДО импорта app
jest.mock('../src/config', () => ({
  config: {
    accountId: 'myapp.testnet',
    privateKey: 'ed25519:fakekey',
    contractId: 'escrow.myapp.testnet',
    networkId: 'testnet',
    nodeUrl: 'https://rpc.testnet.near.org',
    port: 3000,
    releaseApiKey: 'test-api-key',
  },
  validateConfig: jest.fn(),
}));

jest.mock('near-api-js', () => ({
  utils: {
    format: {
      parseNearAmount: jest.fn().mockReturnValue('1000000000000000000000000'),
    },
  },
}));

jest.mock('../src/wallet', () => ({
  loadAccount: jest.fn().mockResolvedValue({}),
  getNEARBalance: jest.fn(),
  getUSDCBalance: jest.fn(),
}));

jest.mock('../src/swap', () => ({
  wrapNEAR: jest.fn(),
  swapNEARtoUSDC: jest.fn(),
}));

jest.mock('../src/escrow', () => ({
  lockFunds: jest.fn(),
  releaseFunds: jest.fn(),
  getPayment: jest.fn(),
  getAllPayments: jest.fn(),
}));

const { getNEARBalance, getUSDCBalance } = require('../src/wallet');
const { wrapNEAR, swapNEARtoUSDC } = require('../src/swap');
const { lockFunds, releaseFunds, getPayment, getAllPayments } = require('../src/escrow');

const app = require('../src/index');

beforeAll(async () => {
  await app.initAccount();
});

// ─── GET /api/balance ─────────────────────────────────────────────────────────

describe('GET /api/balance', () => {
  it('returns NEAR and USDC balance', async () => {
    getNEARBalance.mockResolvedValue({ near: '10.50', yocto: '10500000000000000000000000' });
    getUSDCBalance.mockResolvedValue({ usdc: '5.00', raw: '5000000' });

    const res = await request(app).get('/api/balance');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      near: '10.50',
      yocto: '10500000000000000000000000',
      usdc: '5.00',
      usdcRaw: '5000000',
    });
  });

  it('returns 500 on error', async () => {
    getNEARBalance.mockRejectedValue(new Error('RPC error'));
    getUSDCBalance.mockResolvedValue({ usdc: '0.00', raw: '0' });

    const res = await request(app).get('/api/balance');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('RPC error');
  });
});

// ─── POST /api/swap ───────────────────────────────────────────────────────────

describe('POST /api/swap', () => {
  it('wraps NEAR and swaps to USDC', async () => {
    wrapNEAR.mockResolvedValue({});
    swapNEARtoUSDC.mockResolvedValue({});

    const res = await request(app)
      .post('/api/swap')
      .set('x-api-key', 'test-api-key')
      .send({ amountNEAR: '1', minAmountOut: '0' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(wrapNEAR).toHaveBeenCalled();
    expect(swapNEARtoUSDC).toHaveBeenCalled();
  });

  it('returns 401 if API key is missing', async () => {
    const res = await request(app).post('/api/swap').send({ amountNEAR: '1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/);
  });

  it('returns 400 if amountNEAR is missing', async () => {
    const res = await request(app)
      .post('/api/swap')
      .set('x-api-key', 'test-api-key')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amountNEAR/);
  });

  it('uses default minAmountOut of 0 if not provided', async () => {
    wrapNEAR.mockResolvedValue({});
    swapNEARtoUSDC.mockResolvedValue({});

    const res = await request(app)
      .post('/api/swap')
      .set('x-api-key', 'test-api-key')
      .send({ amountNEAR: '0.5' });

    expect(res.status).toBe(200);
    expect(swapNEARtoUSDC).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      '0'
    );
  });
});

// ─── POST /api/lock ───────────────────────────────────────────────────────────

describe('POST /api/lock', () => {
  it('locks funds in escrow contract', async () => {
    lockFunds.mockResolvedValue({});

    const res = await request(app)
      .post('/api/lock')
      .set('x-api-key', 'test-api-key')
      .send({ paymentId: 'pay_001', amountUsdc: 100000000 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, paymentId: 'pay_001' });
    expect(lockFunds).toHaveBeenCalledWith(
      expect.anything(),
      'escrow.myapp.testnet',
      'pay_001',
      100000000
    );
  });

  it('returns 401 if API key is missing', async () => {
    const res = await request(app).post('/api/lock').send({ paymentId: 'pay_001', amountUsdc: 100000000 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/);
  });

  it('returns 400 if paymentId is missing', async () => {
    const res = await request(app)
      .post('/api/lock')
      .set('x-api-key', 'test-api-key')
      .send({ amountUsdc: 100000000 });
    expect(res.status).toBe(400);
  });

  it('returns 400 if amountUsdc is missing', async () => {
    const res = await request(app)
      .post('/api/lock')
      .set('x-api-key', 'test-api-key')
      .send({ paymentId: 'pay_001' });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/release ────────────────────────────────────────────────────────

describe('POST /api/release', () => {
  it('releases funds with valid API key', async () => {
    releaseFunds.mockResolvedValue({});

    const res = await request(app)
      .post('/api/release')
      .set('x-api-key', 'test-api-key')
      .send({ paymentId: 'pay_001' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, paymentId: 'pay_001' });
    expect(releaseFunds).toHaveBeenCalledWith(
      expect.anything(),
      'escrow.myapp.testnet',
      'pay_001'
    );
  });

  it('returns 401 if API key is missing', async () => {
    const res = await request(app)
      .post('/api/release')
      .send({ paymentId: 'pay_001' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/);
  });

  it('returns 401 if API key is wrong', async () => {
    const res = await request(app)
      .post('/api/release')
      .set('x-api-key', 'wrong-key')
      .send({ paymentId: 'pay_001' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/);
  });

  it('returns 400 if paymentId is missing', async () => {
    const res = await request(app)
      .post('/api/release')
      .set('x-api-key', 'test-api-key')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/paymentId/);
  });
});

// ─── GET /api/payments ────────────────────────────────────────────────────────

describe('GET /api/payments', () => {
  it('returns all payments', async () => {
    const mockPayments = [
      { payment_id: 'pay_001', amount_usdc: 100000000, status: 'Locked' },
      { payment_id: 'pay_002', amount_usdc: 50000000, status: 'Released' },
    ];
    getAllPayments.mockResolvedValue(mockPayments);

    const res = await request(app).get('/api/payments');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockPayments);
  });

  it('returns empty array when no payments', async () => {
    getAllPayments.mockResolvedValue([]);

    const res = await request(app).get('/api/payments');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── GET /api/payments/:id ────────────────────────────────────────────────────

describe('GET /api/payments/:id', () => {
  it('returns payment when found', async () => {
    const mockPayment = { payment_id: 'pay_001', amount_usdc: 100000000, status: 'Locked' };
    getPayment.mockResolvedValue(mockPayment);

    const res = await request(app).get('/api/payments/pay_001');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockPayment);
  });

  it('returns 404 when payment not found', async () => {
    getPayment.mockResolvedValue(null);

    const res = await request(app).get('/api/payments/unknown');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Payment not found/);
  });
});
