const http = require('http');

function mockSendPayment({ amount, currency }) {
  return Promise.resolve({ success: true, ref: `mock_${Date.now()}_${Math.random().toString(36).slice(2)}` });
}

function releaseApp1(app1Url, apiKey, paymentId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ paymentId });
    const url = new URL(`${app1Url}/api/release`);
    const options = {
      hostname: url.hostname,
      port: Number(url.port) || 80,
      path: '/api/release',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': apiKey,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`App 1 returned ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { mockSendPayment, releaseApp1 };
