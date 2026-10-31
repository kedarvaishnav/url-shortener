import { createApp } from './app.js';
import { config } from './config.js';
import { mysqlPool } from './mysql/pool.js';
import { ensureSchema } from './mysql/urlRepository.js';
import { redisClient } from './redis/client.js';
import { prepare } from './services/bloomFilter.js';
import { migrateLegacyRedisUrls } from './services/legacyMigration.js';

async function startServer() {
  await redisClient.connect();
  await mysqlPool.query('SELECT 1');
  await ensureSchema();
  await migrateLegacyRedisUrls();
  await prepare();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] API listening on ${config.port}`);
  });

  process.once('SIGTERM', async () => {
    server.close(async () => {
      if (redisClient.isOpen) await redisClient.quit();
      await mysqlPool.end();
      process.exit(0);
    });
  });
}

startServer().catch(async (error) => {
  console.error('[server] startup failed:', error.message);
  if (redisClient.isOpen) await redisClient.quit();
  await mysqlPool.end();
  process.exitCode = 1;
});
