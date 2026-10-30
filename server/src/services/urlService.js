import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { redisClient } from '../redis/client.js';
import { urlKey } from '../redis/keys.js';
import { add, mightContain } from './bloomFilter.js';

const MAX_CODE_RETRIES = 5;
const CODE_PATTERN = /^[A-Za-z0-9_-]{6}$/;

export async function shortenUrl(url) {
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
    const code = nanoid(6);
    await add(code);
    const saved = await redisClient.set(urlKey(code), url, { NX: true });
    if (saved === 'OK') return `${config.baseUrl}/${code}`;
  }

  throw new Error('Could not generate a unique short code.');
}

export async function resolveCode(code) {
  if (!CODE_PATTERN.test(code)) return null;
  if (!await mightContain(code)) return null;
  return redisClient.get(urlKey(code));
}
