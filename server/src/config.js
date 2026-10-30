function getNumber(name, defaultValue) {
  const value = Number(process.env[name] ?? defaultValue);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number.`);
  return value;
}

const port = getNumber('PORT', 3000);
const redisPort = getNumber('REDIS_PORT', 6379);
const redisDatabase = getNumber('REDIS_DB', 0);
const expectedItems = getNumber('BLOOM_EXPECTED_ITEMS', 1000000);
const falsePositiveRate = getNumber('BLOOM_FALSE_POSITIVE_RATE', 0.01);

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535.');
}
if (!Number.isInteger(redisPort) || redisPort < 1 || redisPort > 65535) {
  throw new Error('REDIS_PORT must be an integer between 1 and 65535.');
}
if (!Number.isInteger(redisDatabase) || redisDatabase < 0) {
  throw new Error('REDIS_DB must be a non-negative integer.');
}
if (!Number.isInteger(expectedItems) || expectedItems < 1) {
  throw new Error('BLOOM_EXPECTED_ITEMS must be a positive integer.');
}
if (falsePositiveRate <= 0 || falsePositiveRate >= 1) {
  throw new Error('BLOOM_FALSE_POSITIVE_RATE must be between 0 and 1.');
}

const portForUrl = port === 0 ? 3000 : port;
const baseUrl = (process.env.BASE_URL || `http://localhost:${portForUrl}`).replace(/\/$/, '');
let parsedBaseUrl;

try {
  parsedBaseUrl = new URL(baseUrl);
} catch {
  throw new Error('BASE_URL must be a valid http/https URL.');
}
if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
  throw new Error('BASE_URL must be a valid http/https URL.');
}

export const config = Object.freeze({
  port,
  baseUrl,
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort,
  redisDatabase,
  bloomExpectedItems: expectedItems,
  bloomFalsePositiveRate: falsePositiveRate,
});
