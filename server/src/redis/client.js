import { createClient } from 'redis';
import { config } from '../config.js';

export const redisClient = createClient({
  socket: {
    host: config.redisHost,
    port: config.redisPort,
  },
  database: config.redisDatabase,
});

redisClient.on('error', (error) => {
  console.error('[redis] client error:', error.message);
});
