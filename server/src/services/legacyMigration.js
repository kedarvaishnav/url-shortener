import { redisClient } from '../redis/client.js';
import {
  hasMigration,
  insertUrlIfMissing,
  markMigrationComplete,
} from '../mysql/urlRepository.js';

const MIGRATION_NAME = 'copy-redis-url-keys-to-mysql-v1';
const LEGACY_URL_PATTERN = /^[A-Za-z0-9_-]{6}$/;

export async function migrateLegacyRedisUrls() {
  if (await hasMigration(MIGRATION_NAME)) return;

  for await (const key of redisClient.scanIterator({ MATCH: 'url:*', COUNT: 1000 })) {
    const alias = key.slice('url:'.length);
    if (!LEGACY_URL_PATTERN.test(alias)) continue;

    const destinationUrl = await redisClient.get(key);
    if (destinationUrl) {
      await insertUrlIfMissing(alias, destinationUrl);
      await redisClient.del(key);
    }
  }

  await markMigrationComplete(MIGRATION_NAME);
}
