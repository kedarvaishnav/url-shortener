import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { redisClient } from '../redis/client.js';

const BLOOM_KEY = 'bloom:urls';
const BLOOM_META_KEY = 'bloom:urls:meta';
const URL_KEY_PREFIX = 'url:';
const SCAN_COUNT = 1000;
const LOG_TWO = Math.log(2);

const bits = Math.ceil(
  -(config.bloomExpectedItems * Math.log(config.bloomFalsePositiveRate)) / (LOG_TWO ** 2),
);
const hashes = Math.round((bits / config.bloomExpectedItems) * LOG_TWO);

function getBitIndexes(code) {
  const digest = createHash('sha256').update(code).digest();
  const firstHash = digest.readUInt32BE(0);
  const secondHash = (digest.readUInt32BE(4) | 1) >>> 0;

  return Array.from({ length: hashes }, (_, index) => (
    (firstHash + index * secondHash) % bits
  ));
}

function filterMetadata() {
  return {
    bits: String(bits),
    hashes: String(hashes),
    expectedItems: String(config.bloomExpectedItems),
    falsePositiveRate: String(config.bloomFalsePositiveRate),
  };
}

function metadataMatches(metadata) {
  const expected = filterMetadata();
  return Object.entries(expected).every(([key, value]) => metadata[key] === value);
}

export async function add(code) {
  const transaction = redisClient.multi();
  for (const index of getBitIndexes(code)) {
    transaction.setBit(BLOOM_KEY, index, 1);
  }
  transaction.hIncrBy(BLOOM_META_KEY, 'itemsAdded', 1);
  await transaction.exec();
}

export async function mightContain(code) {
  const transaction = redisClient.multi();
  for (const index of getBitIndexes(code)) {
    transaction.getBit(BLOOM_KEY, index);
  }
  const bitValues = await transaction.exec();
  return bitValues.every((value) => Number(value) === 1);
}

export async function prepare() {
  const metadata = await redisClient.hGetAll(BLOOM_META_KEY);
  if (metadataMatches(metadata)) return;

  await redisClient.del(BLOOM_KEY, BLOOM_META_KEY);
  let itemsAdded = 0;

  for await (const key of redisClient.scanIterator({
    MATCH: `${URL_KEY_PREFIX}*`,
    COUNT: SCAN_COUNT,
  })) {
    await add(key.slice(URL_KEY_PREFIX.length));
    itemsAdded += 1;
  }

  await redisClient.hSet(BLOOM_META_KEY, {
    ...filterMetadata(),
    itemsAdded: String(itemsAdded),
  });
}

export async function getStats() {
  const metadata = await redisClient.hGetAll(BLOOM_META_KEY);
  const bitsSet = await redisClient.bitCount(BLOOM_KEY);

  return {
    bits,
    hashes,
    expectedItems: config.bloomExpectedItems,
    targetFalsePositiveRate: config.bloomFalsePositiveRate,
    itemsAdded: Number(metadata.itemsAdded || 0),
    bitsSet,
    estimatedFalsePositiveRate: (bitsSet / bits) ** hashes,
  };
}
