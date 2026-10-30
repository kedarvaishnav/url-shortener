import { randomBytes } from 'node:crypto';
import { config } from '../src/config.js';
import { redisClient } from '../src/redis/client.js';
import { mightContain } from '../src/services/bloomFilter.js';

const REQUEST_COUNT = 10000;
const REQUEST_BATCH_SIZE = 100;
const URL_KEY_PREFIX = 'url:';

async function getExistingCodes() {
  const codes = new Set();
  for await (const key of redisClient.scanIterator({ MATCH: `${URL_KEY_PREFIX}*`, COUNT: 1000 })) {
    codes.add(key.slice(URL_KEY_PREFIX.length));
  }
  return codes;
}

function createUnknownCodes(count, existingCodes) {
  const codes = new Set();
  while (codes.size < count) {
    const code = randomBytes(6).toString('base64url').slice(0, 6);
    if (!existingCodes.has(code)) codes.add(code);
  }
  return [...codes];
}

async function countFilterHits(codes) {
  let hits = 0;
  for (const code of codes) {
    if (await mightContain(code)) hits += 1;
  }
  return hits;
}

async function sendUnknownRequests(codes) {
  let notFoundResponses = 0;

  for (let start = 0; start < codes.length; start += REQUEST_BATCH_SIZE) {
    const batch = codes.slice(start, start + REQUEST_BATCH_SIZE);
    const responses = await Promise.all(batch.map((code) => (
      fetch(`${config.baseUrl}/${code}`)
    )));
    notFoundResponses += responses.filter((response) => response.status === 404).length;
  }

  return notFoundResponses;
}

async function runBenchmark() {
  await redisClient.connect();
  try {
    const existingCodes = await getExistingCodes();
    const codes = createUnknownCodes(REQUEST_COUNT, existingCodes);
    const filterHits = await countFilterHits(codes);
    const startedAt = performance.now();
    const notFoundResponses = await sendUnknownRequests(codes);
    const durationMs = Math.round(performance.now() - startedAt);
    const avoidedLookups = REQUEST_COUNT - filterHits;
    const avoidedPercent = ((avoidedLookups / REQUEST_COUNT) * 100).toFixed(2);

    console.log(`Unknown requests completed: ${notFoundResponses}/${REQUEST_COUNT}`);
    console.log(`Redis GETs without Bloom filter: ${REQUEST_COUNT}`);
    console.log(`Redis GETs with Bloom filter: ${filterHits}`);
    console.log(`Redis GETs avoided: ${avoidedLookups} (${avoidedPercent}%)`);
    console.log(`Request time: ${durationMs} ms`);
  } finally {
    if (redisClient.isOpen) await redisClient.quit();
  }
}

runBenchmark().catch((error) => {
  console.error('[benchmark] failed:', error.message);
  process.exitCode = 1;
});
