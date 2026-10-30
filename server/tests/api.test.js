import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { createClient } from 'redis';

const SERVER_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REDIS_DB = Number(process.env.REDIS_DB || 0);
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
  },
  database: REDIS_DB,
});

let serverProcess;
let baseUrl;

async function getAvailablePort() {
  const portServer = net.createServer();
  portServer.listen(0, '0.0.0.0');
  await once(portServer, 'listening');
  const { port } = portServer.address();
  await new Promise((resolve, reject) => {
    portServer.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForServer(child) {
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API startup timed out')), 10000);
    const checkOutput = (chunk) => {
      output += chunk;
      if (output.includes('[server] API listening')) {
        clearTimeout(timer);
        resolve();
      }
    };

    child.stdout.on('data', checkOutput);
    child.stderr.on('data', checkOutput);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`API exited (${code}): ${output}`));
    });
  });
}

before(async () => {
  assert.equal(REDIS_DB, 15, 'tests must run with REDIS_DB=15');
  await redisClient.connect();
  await redisClient.flushDb();

  const port = await getAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIRECTORY,
    env: { ...process.env, PORT: String(port), REDIS_DB: String(REDIS_DB), BASE_URL: baseUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer(serverProcess);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
    await once(serverProcess, 'exit');
  }
  if (redisClient.isOpen) await redisClient.quit();
});

test('GET /health returns the documented status', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('POST /shorten rejects missing and non-http URLs', async () => {
  for (const body of [{}, { url: 'ftp://example.com' }]) {
    const response = await fetch(`${baseUrl}/shorten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('POST /shorten creates a link and GET /:code redirects to its destination', async () => {
  const destination = 'https://example.com/some/long/path';
  const response = await fetch(`${baseUrl}/shorten`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: destination }),
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  const shortUrl = new URL(result.shortUrl);
  assert.equal(shortUrl.origin, baseUrl);
  assert.match(shortUrl.pathname.slice(1), /^[A-Za-z0-9_-]{6}$/);

  const redirect = await fetch(result.shortUrl, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), destination);
});

test('GET /:code returns 404 for an unknown code', async () => {
  const response = await fetch(`${baseUrl}/abcdef`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('shortening the same URL twice creates two working short links', async () => {
  const destination = 'https://example.com/reused';
  const shorten = () => fetch(`${baseUrl}/shorten`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: destination }),
  });

  const first = await (await shorten()).json();
  const second = await (await shorten()).json();
  assert.notEqual(first.shortUrl, second.shortUrl);

  for (const shortUrl of [first.shortUrl, second.shortUrl]) {
    const response = await fetch(shortUrl, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), destination);
  }
});
