import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { findUrl, insertUrl } from '../mysql/urlRepository.js';
import { redisClient } from '../redis/client.js';
import { urlCacheKey } from '../redis/keys.js';
import { add, mightContain } from './bloomFilter.js';

const MAX_CODE_RETRIES = 5;
const CODE_PATTERN = /^[A-Za-z0-9_-]{6}$/;

export async function shortenUrl(url) {
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
    const code = nanoid(6);
    await add(code);
    try {
      await insertUrl(code, url);
      return `${config.baseUrl}/${code}`;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
  }

  throw new Error('Could not generate a unique short code.');
}

export async function resolveCode(code) {
  if (!CODE_PATTERN.test(code)) return null;

  const cacheKey = urlCacheKey(code);
  try {
    const cachedUrl = await redisClient.get(cacheKey);
    if (cachedUrl) return cachedUrl;
    if (!await mightContain(code)) return null;
  } catch (error) {
    console.error('[redis] cache/filter lookup failed:', error.message);
  }

  const destinationUrl = await findUrl(code);
  if (!destinationUrl) return null;

  try {
    await redisClient.set(cacheKey, destinationUrl, { EX: config.redisCacheTtlSeconds });
  } catch (error) {
    console.error('[redis] could not cache URL:', error.message);
  }
  return destinationUrl;
}
