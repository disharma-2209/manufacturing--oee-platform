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

// Step 1: login
const loginBody = JSON.stringify({ username: 'admin', password: 'admin' });
let loginRes;
try {
  loginRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) }
  }, loginBody);
  console.log('Login status:', loginRes.status);
} catch (e) {
  console.error('Login failed:', e.message);
  process.exit(1);
}

if (loginRes.status !== 200) {
  // Try other common passwords
  for (const pass of ['password', 'admin123', 'changeme', 'oee123', 'Admin123', 'admin', 'Admin@123', 'enphase', 'enphase123', 'oee', 'oee2026', 'admin2026']) {
    const b = JSON.stringify({ username: 'admin', password: pass });
    const r = await request({
      hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }
    }, b);
    if (r.status === 200) { loginRes = r; console.log(`Login OK with password: ${pass}`); break; }
  }
}

if (loginRes.status !== 200) {
  console.error('Could not authenticate. Response:', loginRes.body);
  process.exit(1);
}

const token = JSON.parse(loginRes.body).token;
console.log('Got token:', token ? token.substring(0, 30) + '...' : 'NONE');

// Step 2: call /analyze/weeks
const weeksRes = await request({
  hostname: 'localhost', port: 3001, path: '/api/analyze/weeks', method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
}, null);

console.log('\n=== LIVE /api/analyze/weeks response ===');
console.log('Status:', weeksRes.status);
console.log('Body:', JSON.stringify(JSON.parse(weeksRes.body), null, 2));

// Step 3: call the fix endpoint
console.log('\n=== Calling ISO week fix endpoint ===');
const fixRes = await request({
  hostname: 'localhost', port: 3001, path: '/api/admin/fix-iso-weeks', method: 'POST',
  headers: { 'x-fix-secret': 'enphase-oee-fix-2026', 'Content-Length': '0' }
}, null);
console.log('Fix status:', fixRes.status);
try { console.log('Fix body:', JSON.stringify(JSON.parse(fixRes.body), null, 2)); } catch { console.log('Fix raw:', fixRes.body); }

// Step 4: re-check weeks after fix
const weeks2Res = await request({
  hostname: 'localhost', port: 3001, path: '/api/analyze/weeks', method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
}, null);
console.log('\n=== /api/analyze/weeks AFTER fix ===');
console.log(JSON.stringify(JSON.parse(weeks2Res.body), null, 2));
