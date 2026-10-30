import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { redisClient } from '../redis/client.js';
import { urlKey } from '../redis/keys.js';

const MAX_CODE_RETRIES = 5;

export async function shortenUrl(url) {
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
    const code = nanoid(6);
    const saved = await redisClient.set(urlKey(code), url, { NX: true });
    if (saved === 'OK') return `${config.baseUrl}/${code}`;
  }

  throw new Error('Could not generate a unique short code.');
}

export function resolveCode(code) {
  return redisClient.get(urlKey(code));
}
