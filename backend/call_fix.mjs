import http from 'http';

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

console.log('Calling fix endpoint...');
const fixRes = await request({
  hostname: 'localhost', port: 3001,
  path: '/api/admin/fix-iso-weeks', method: 'POST',
  headers: { 'x-fix-secret': 'enphase-oee-fix-2026', 'Content-Length': '0' }
}, null);

console.log('Status:', fixRes.status);
try {
  const body = JSON.parse(fixRes.body);
  console.log('Result:', JSON.stringify(body, null, 2));
} catch {
  console.log('Raw response:', fixRes.body);
}
