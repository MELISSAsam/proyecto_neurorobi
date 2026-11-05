// Production smoke test with an isolated database and dedicated ports.
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const data = mkdtempSync(path.join(tmpdir(), 'neurorobi-deploy-'));
const env = { ...process.env, NODE_ENV: 'production', SEED_DEMO_DATA: 'false',
  DATABASE_URL: `file:${path.join(data, 'test.db').replaceAll('\\', '/')}`,
  UPLOADS_DIR: path.join(data, 'uploads'), JWT_SECRET: 'isolated-test-secret-with-at-least-32-characters',
  INITIAL_ADMIN_EMAIL: 'deploy@example.test', INITIAL_ADMIN_PASSWORD: 'isolated-password-123',
  TELEMETRY_API_KEY: 'isolated-device-key', PORT: '43101', REGISTRY_PORT: '43100',
  AUTH_PORT: '43102', PATIENT_PORT: '43103', SESSION_PORT: '43104', TELEMETRY_PORT: '43105',
  REGISTRY_URL: 'http://127.0.0.1:43100', SERVICE_HOSTNAME: '127.0.0.1',
  AUTH_SERVICE_URL: 'http://127.0.0.1:43102', PATIENT_SERVICE_URL: 'http://127.0.0.1:43103',
  SESSION_SERVICE_URL: 'http://127.0.0.1:43104', TELEMETRY_SERVICE_URL: 'http://127.0.0.1:43105' };
const children = [];
let logs = '';
const base = 'http://127.0.0.1:43101';
async function request(route, options = {}, status = 200) {
  const res = await fetch(base + route, { ...options, signal: AbortSignal.timeout(12000) });
  const body = await res.json();
  assert.equal(res.status, status, `${route}: ${JSON.stringify(body)}`);
  return body;
}
async function main() {
  for (const script of ['migrate.cjs', 'bootstrap-admin.cjs', 'bootstrap-admin.cjs']) {
    const result = spawnSync(process.execPath, [path.join('scripts', script)], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  for (const service of ['service-registry', 'auth-service', 'patient-service', 'session-service', 'telemetry-service', 'api-gateway']) {
    const child = spawn(process.execPath, [`dist/services/${service}/index.js`], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { logs += chunk; });
    child.stderr.on('data', chunk => { logs += chunk; });
    children.push(child);
  }
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try { await request('/health'); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Services did not become ready');
  await request('/api/patients', {}, 401);
  await request('/api/telemetry', { method: 'POST' }, 401);
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.INITIAL_ADMIN_EMAIL, password: env.INITIAL_ADMIN_PASSWORD }) });
  const headers = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' };
  const staffToken = require('jsonwebtoken').sign({ id: login.user.id, role: 'FISIOTERAPIA' }, env.JWT_SECRET);
  for (const route of ['/api/auth/register', '/api/AUTH/REGISTER']) {
    await request(route, { method: 'POST', headers: { Authorization: `Bearer ${staffToken}` } }, 403);
  }
  assert.deepEqual(await request('/api/patients', { headers }), []);
  await request(`/api/auth/profile/${login.user.id}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Smoke Admin' }) });
  const profile = new FormData();
  profile.set('name', 'Multipart Admin');
  profile.set('profileImage', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1cAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
  const updated = await request(`/api/auth/profile/${login.user.id}`, { method: 'PUT', headers: { Authorization: headers.Authorization }, body: profile });
  assert.ok((await fetch(base + updated.profileImageUrl)).ok);
  await request('/api/auth/profile/other-user', { method: 'PUT', headers, body: '{}' }, 403);
  const patient = await request('/api/patients', { method: 'POST', headers, body: JSON.stringify({ name: 'Smoke Patient', age: 8, diagnosis: 'TEA', initialObservation: 'Test' }) }, 201);
  assert.ok(patient.id);
  const session = await request('/api/sessions', { method: 'POST', headers, body: JSON.stringify({
    patientId: patient.id, specialistId: login.user.id, durationSeconds: 60, metrics: {}, notes: 'Smoke session'
  }) }, 201);
  assert.equal((await request(`/api/sessions/${session.id}`, { headers })).notes, 'Smoke session');
  await request('/api/stats', { headers });
  await request('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device-key': env.TELEMETRY_API_KEY }, body: JSON.stringify({ deviceType: 'pulsera', heartRate: 80 }) });
  const { io } = require(path.resolve(root, '../../fronted_NeuroRobi-main/neurorobi_fronted/node_modules/socket.io-client'));
  for (const transport of ['websocket', 'polling']) {
    await new Promise((resolve, reject) => {
      const socket = io(base, { transports: [transport], auth: { token: login.token }, reconnection: false });
      const timer = setTimeout(() => { socket.close(); reject(new Error(`Socket timeout: ${transport}`)); }, 10000);
      socket.on('connect', () => { clearTimeout(timer); socket.close(); resolve(); });
      socket.on('connect_error', err => { clearTimeout(timer); socket.close(); reject(err); });
    });
  }
  await new Promise((resolve, reject) => {
    const socket = io(base, { transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => { socket.close(); reject(new Error('Unauthenticated socket timeout')); }, 10000);
    socket.on('connect', () => { clearTimeout(timer); socket.close(); reject(new Error('Unauthenticated socket accepted')); });
    socket.on('connect_error', err => { clearTimeout(timer); socket.close(); assert.match(err.message, /Sesion invalida/); resolve(); });
  });
  // Restart the process that owns patient queries and verify persisted records.
  const patientProcess = children[2];
  await new Promise(resolve => { patientProcess.once('exit', resolve); patientProcess.kill(); });
  await request('/health', {}, 503);
  await request('/api/patients', { headers }, 502);
  const restarted = spawn(process.execPath, ['dist/services/patient-service/index.js'], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
  children[2] = restarted;
  let recovered = false;
  for (let n = 0; n < 40; n++) {
    try { await request('/health'); recovered = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(recovered);
  assert.equal((await request(`/api/patients/${patient.id}`, { headers })).id, patient.id);
  assert.equal((await request(`/api/sessions/${session.id}`, { headers })).notes, 'Smoke session');
  assert.ok((await fetch(base + updated.profileImageUrl)).ok);
  console.log('PASS: migrations, bootstrap, login, authorization, JSON/multipart profile, uploads, patients, session save/read, stats, device key, Socket.IO websocket/polling, rejected anonymous socket, readiness 503, proxy 502, restart persistence.');
  console.log(`Isolated test artifacts: ${data}`);
}
main().catch(err => { console.error(err, logs); process.exitCode = 1; }).finally(async () => {
  await Promise.all(children.map(child => new Promise(resolve => { child.once('exit', resolve); if (!child.kill()) resolve(); })));
});
