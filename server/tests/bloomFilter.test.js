import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { config } from '../src/config.js';
import { add, getStats, mightContain, prepare } from '../src/services/bloomFilter.js';
import { redisClient } from '../src/redis/client.js';

function createUniqueCodes(count, excluded = new Set()) {
  const codes = new Set();
  while (codes.size < count) {
    const code = randomBytes(6).toString('base64url').slice(0, 6);
    if (!excluded.has(code)) codes.add(code);
  }
  return [...codes];
}

before(async () => {
  assert.equal(config.redisDatabase, 15, 'tests must run with REDIS_DB=15');
  await redisClient.connect();
});

beforeEach(async () => {
  await redisClient.flushDb();
});

after(async () => {
  if (redisClient.isOpen) await redisClient.quit();
});

test('calculates the documented filter size', async () => {
  await prepare();
  const stats = await getStats();

  assert.equal(stats.bits, 9585059);
  assert.equal(stats.hashes, 7);
  assert.equal(stats.expectedItems, 1000000);
});

test('returns false for an unknown code in an empty filter', async () => {
  await prepare();
  assert.equal(await mightContain('abcdef'), false);
});

test('never misses a code that was added', async () => {
  await prepare();
  const codes = createUniqueCodes(1000);
  for (const code of codes) await add(code);

  for (const code of codes) {
    assert.equal(await mightContain(code), true, `filter missed ${code}`);
  }
});

test('keeps the measured false-positive rate below twice the target', async () => {
  await prepare();
  const insertedCodes = createUniqueCodes(10000);
  const insertedSet = new Set(insertedCodes);
  for (const code of insertedCodes) await add(code);

  const unknownCodes = createUniqueCodes(10000, insertedSet);
  let falsePositives = 0;
  for (const code of unknownCodes) {
    if (await mightContain(code)) falsePositives += 1;
  }

  const measuredRate = falsePositives / unknownCodes.length;
  assert.ok(measuredRate < 2 * config.bloomFalsePositiveRate);
});

test('rebuilds the filter from saved URL keys', async () => {
  const codes = createUniqueCodes(5);
  for (const code of codes) {
    await redisClient.set(`url:${code}`, 'https://example.com');
  }
  await prepare();

  for (const code of codes) {
    assert.equal(await mightContain(code), true);
  }
  assert.equal((await getStats()).itemsAdded, codes.length);
});
