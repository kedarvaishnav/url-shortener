import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { config } from '../src/config.js';
import { mysqlPool } from '../src/mysql/pool.js';
import { ensureSchema, findUrl, insertUrl } from '../src/mysql/urlRepository.js';
import { redisClient } from '../src/redis/client.js';
import { urlCacheKey } from '../src/redis/keys.js';
import { mightContain, prepare } from '../src/services/bloomFilter.js';
import { resolveCode, shortenUrl } from '../src/services/urlService.js';

before(async () => {
  assert.equal(config.redisDatabase, 15, 'tests must run with REDIS_DB=15');
  await ensureSchema();
  await redisClient.connect();
});

beforeEach(async () => {
  await redisClient.flushDb();
  await mysqlPool.query('DELETE FROM short_urls');
  await prepare();
});

after(async () => {
  if (redisClient.isOpen) await redisClient.quit();
  await mysqlPool.end();
});

test('adds a code to the Bloom filter before saving it in MySQL', async () => {
  const originalExecute = mysqlPool.execute;
  let filterHadCodeBeforeSave = false;

  mysqlPool.execute = async (query, values) => {
    if (query.startsWith('INSERT INTO short_urls')) {
      filterHadCodeBeforeSave = await mightContain(values[0]);
    }
    return originalExecute.call(mysqlPool, query, values);
  };

  let shortUrl;
  try {
    shortUrl = await shortenUrl('https://example.com/new');
  } finally {
    mysqlPool.execute = originalExecute;
  }

  const code = new URL(shortUrl).pathname.slice(1);
  assert.equal(filterHadCodeBeforeSave, true);
  assert.equal(await findUrl(code), 'https://example.com/new');
});

test('stores aliases with case-sensitive uniqueness in MySQL', async () => {
  await insertUrl('Abc123', 'https://example.com/upper');
  await insertUrl('abc123', 'https://example.com/lower');

  assert.equal(await findUrl('Abc123'), 'https://example.com/upper');
  assert.equal(await findUrl('abc123'), 'https://example.com/lower');
});

test('returns null without a MySQL lookup for a code the filter excludes', async () => {
  const originalExecute = mysqlPool.execute;
  let lookupCalls = 0;
  mysqlPool.execute = async (query, values) => {
    if (query.includes('SELECT destination_url FROM short_urls')) lookupCalls += 1;
    return originalExecute.call(mysqlPool, query, values);
  };

  try {
    assert.equal(await resolveCode('abcdef'), null);
    assert.equal(lookupCalls, 0);
  } finally {
    mysqlPool.execute = originalExecute;
  }
});

test('caches a MySQL result in Redis and serves the next lookup from cache', async () => {
  const shortUrl = await shortenUrl('https://example.com/cached');
  const code = new URL(shortUrl).pathname.slice(1);
  let mysqlLookups = 0;
  const originalExecute = mysqlPool.execute;
  mysqlPool.execute = async (query, values) => {
    if (query.includes('SELECT destination_url FROM short_urls')) mysqlLookups += 1;
    return originalExecute.call(mysqlPool, query, values);
  };
  try {
    assert.equal(await resolveCode(code), 'https://example.com/cached');
    assert.equal(await redisClient.ttl(urlCacheKey(code)) > 0, true);
    assert.equal(await resolveCode(code), 'https://example.com/cached');
    assert.equal(mysqlLookups, 1);
  } finally {
    mysqlPool.execute = originalExecute;
  }
});

test('rejects a code with the wrong format before checking Redis', async () => {
  const originalGet = redisClient.get;
  let getCalls = 0;
  redisClient.get = async (...args) => {
    getCalls += 1;
    return originalGet.apply(redisClient, args);
  };

  try {
    assert.equal(await resolveCode('short'), null);
    assert.equal(getCalls, 0);
  } finally {
    redisClient.get = originalGet;
  }
});
