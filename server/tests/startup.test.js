import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, test } from 'node:test';
import { config } from '../src/config.js';
import { mysqlPool } from '../src/mysql/pool.js';
import { ensureSchema, findUrl, insertUrl } from '../src/mysql/urlRepository.js';
import { redisClient } from '../src/redis/client.js';
import { prepare } from '../src/services/bloomFilter.js';

const SERVER_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

async function startServer(extraEnvironment = {}) {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: SERVER_DIRECTORY,
    env: {
      ...process.env,
      PORT: String(port),
      BASE_URL: baseUrl,
      REDIS_DB: '15',
      ...extraEnvironment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForServer(child);
  return { child, baseUrl };
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

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await once(child, 'exit');
}

before(async () => {
  assert.equal(config.redisDatabase, 15, 'tests must run with REDIS_DB=15');
  await ensureSchema();
  await redisClient.connect();
});

beforeEach(async () => {
  await redisClient.flushDb();
  await mysqlPool.query('DELETE FROM short_urls');
  await mysqlPool.query('DELETE FROM app_migrations');
});

after(async () => {
  if (redisClient.isOpen) await redisClient.quit();
  await mysqlPool.end();
});

test('rebuilds a missing filter before the API starts serving links', async () => {
  const destination = 'https://example.com/kept-link';
  await insertUrl('abc123', destination);
  await redisClient.del(['bloom:urls', 'bloom:urls:meta']);

  const { child, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/abc123`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), destination);
    assert.equal(await redisClient.hGet('bloom:urls:meta', 'source'), 'mysql');
  } finally {
    await stopServer(child);
  }
});

test('rebuilds the filter when its configured size changes', async () => {
  const destination = 'https://example.com/config-change';
  await insertUrl('xyz789', destination);
  await prepare();
  assert.equal(await redisClient.hGet('bloom:urls:meta', 'expectedItems'), '1000000');

  const { child, baseUrl } = await startServer({ BLOOM_EXPECTED_ITEMS: '500000' });
  try {
    const metadata = await redisClient.hGetAll('bloom:urls:meta');
    const expectedBits = Math.ceil(-(500000 * Math.log(0.01)) / (Math.log(2) ** 2));
    assert.equal(metadata.expectedItems, '500000');
    assert.equal(metadata.bits, String(expectedBits));
    assert.equal(metadata.source, 'mysql');

    const response = await fetch(`${baseUrl}/xyz789`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), destination);
  } finally {
    await stopServer(child);
  }
});

test('imports legacy Redis mappings into MySQL before serving requests', async () => {
  const destination = 'https://example.com/legacy';
  await redisClient.set('url:old123', destination);

  const { child, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/old123`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), destination);
    assert.equal(await findUrl('old123'), destination);
    assert.equal(await redisClient.get('url:old123'), null);
  } finally {
    await stopServer(child);
  }
});
