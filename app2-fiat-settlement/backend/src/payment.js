function mockSendPayment({ amount, currency }) {
  if (!amount || !currency) throw new Error('amount and currency are required');
  return Promise.resolve({ success: true, ref: `mock_${Date.now()}_${Math.random().toString(36).slice(2)}` });
}

function releaseApp1(app1Url, apiKey, paymentId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ paymentId });
    const url = new URL(`${app1Url}/api/release`);
    const protocol = app1Url.startsWith('https') ? require('https') : require('http');
    const defaultPort = app1Url.startsWith('https') ? 443 : 80;
    const options = {
      hostname: url.hostname,
      port: Number(url.port) || defaultPort,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': apiKey,
      },
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`App 1 returned invalid JSON: ${data}`));
          }
        } else {
          reject(new Error(`App 1 returned ${res.statusCode}: ${data}`));
        }
      });
    });

    req.setTimeout(10000, () => {
      req.destroy(new Error('Request to App 1 timed out'));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { mockSendPayment, releaseApp1 };
