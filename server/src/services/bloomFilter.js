import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { countUrls, listAliasesAfter } from '../mysql/urlRepository.js';
import { redisClient } from '../redis/client.js';

const BLOOM_KEY = 'bloom:urls';
const BLOOM_META_KEY = 'bloom:urls:meta';
const REBUILD_PAGE_SIZE = 250;
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
    source: 'mysql',
  };
}

function metadataMatches(metadata) {
  const expected = filterMetadata();
  return Object.entries(expected).every(([key, value]) => metadata[key] === value);
}

export async function addMany(codes) {
  if (codes.length === 0) return;

  const transaction = redisClient.multi();
  for (const code of codes) {
    for (const index of getBitIndexes(code)) {
      transaction.setBit(BLOOM_KEY, index, 1);
    }
  }
  await transaction.exec();
}

export async function add(code) {
  await addMany([code]);
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

  await redisClient.del([BLOOM_KEY, BLOOM_META_KEY]);
  let lastAlias = '';

  while (true) {
    const aliases = await listAliasesAfter(lastAlias, REBUILD_PAGE_SIZE);
    if (aliases.length === 0) break;

    await addMany(aliases);
    lastAlias = aliases.at(-1);
  }

  await redisClient.hSet(BLOOM_META_KEY, filterMetadata());
}

export async function getStats() {
  const bitsSet = await redisClient.bitCount(BLOOM_KEY);
  const itemsAdded = await countUrls();

  return {
    bits,
    hashes,
    expectedItems: config.bloomExpectedItems,
    targetFalsePositiveRate: config.bloomFalsePositiveRate,
    itemsAdded,
    bitsSet,
    estimatedFalsePositiveRate: (bitsSet / bits) ** hashes,
  };
}
