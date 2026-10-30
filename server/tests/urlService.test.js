import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { config } from '../src/config.js';
import { redisClient } from '../src/redis/client.js';
import { urlKey } from '../src/redis/keys.js';
import { mightContain, prepare } from '../src/services/bloomFilter.js';
import { resolveCode, shortenUrl } from '../src/services/urlService.js';

before(async () => {
  assert.equal(config.redisDatabase, 15, 'tests must run with REDIS_DB=15');
  await redisClient.connect();
});

beforeEach(async () => {
  await redisClient.flushDb();
  await prepare();
});

after(async () => {
  if (redisClient.isOpen) await redisClient.quit();
});

test('adds a code to the Bloom filter before saving its URL', async () => {
  const originalSet = redisClient.set;
  let filterHadCodeBeforeSave = false;

  redisClient.set = async (key, ...args) => {
    const code = key.slice('url:'.length);
    filterHadCodeBeforeSave = await mightContain(code);
    return originalSet.call(redisClient, key, ...args);
  };

  let shortUrl;
  try {
    shortUrl = await shortenUrl('https://example.com/new');
  } finally {
    redisClient.set = originalSet;
  }

  const code = new URL(shortUrl).pathname.slice(1);
  assert.equal(filterHadCodeBeforeSave, true);
  assert.equal(await redisClient.get(urlKey(code)), 'https://example.com/new');
});

test('returns null without a Redis GET for a code the filter excludes', async () => {
  const originalGet = redisClient.get;
  let getCalls = 0;
  redisClient.get = async (...args) => {
    getCalls += 1;
    return originalGet.apply(redisClient, args);
  };

  try {
    assert.equal(await resolveCode('abcdef'), null);
    assert.equal(getCalls, 0);
  } finally {
    redisClient.get = originalGet;
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
