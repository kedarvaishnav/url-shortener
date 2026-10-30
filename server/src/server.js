import { createApp } from './app.js';
import { config } from './config.js';
import { redisClient } from './redis/client.js';

async function startServer() {
  await redisClient.connect();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] API listening on ${config.port}`);
  });

  process.once('SIGTERM', async () => {
    server.close(async () => {
      if (redisClient.isOpen) await redisClient.quit();
      process.exit(0);
    });
  });
}

startServer().catch((error) => {
  console.error('[server] startup failed:', error.message);
  process.exitCode = 1;
});
