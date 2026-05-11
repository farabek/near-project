const http = require('http');
const { mockSendPayment, releaseApp1 } = require('../src/payment');

describe('mockSendPayment', () => {
  test('always resolves with success and a ref string', async () => {
    const result = await mockSendPayment({ amount: 100, currency: 'USD' });
    expect(result.success).toBe(true);
    expect(typeof result.ref).toBe('string');
    expect(result.ref.length).toBeGreaterThan(0);
  });

  test('works with any currency', async () => {
    const result = await mockSendPayment({ amount: 500, currency: 'RUB' });
    expect(result.success).toBe(true);
  });
});

describe('releaseApp1', () => {
  let server;
  let lastRequest;

  beforeEach(() => new Promise((resolve) => {
    lastRequest = null;
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        lastRequest = { method: req.method, headers: req.headers, body: JSON.parse(body) };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, paymentId: JSON.parse(body).paymentId }));
      });
    });
    server.listen(0, resolve);
  }));

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  test('sends POST /api/release with correct paymentId and x-api-key', async () => {
    const port = server.address().port;
    const result = await releaseApp1(`http://localhost:${port}`, 'test-key', 'pay_001');
    expect(result.success).toBe(true);
    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.headers['x-api-key']).toBe('test-key');
    expect(lastRequest.body.paymentId).toBe('pay_001');
  });

  test('rejects when server returns non-200', async () => {
    const badServer = http.createServer((req, res) => {
      res.writeHead(401);
      res.end('Unauthorized');
    });
    await new Promise((done) => badServer.listen(0, done));
    const port = badServer.address().port;
    await expect(releaseApp1(`http://localhost:${port}`, 'bad-key', 'pay_001'))
      .rejects.toThrow('App 1 returned 401');
    await new Promise((done) => badServer.close(done));
  });

  test('rejects when server is unreachable', async () => {
    await expect(releaseApp1('http://localhost:19999', 'key', 'pay_001'))
      .rejects.toThrow();
  });
});
