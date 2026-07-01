import express from 'express';
import { createClient } from 'redis';
import { nanoid } from 'nanoid';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const redisClient = createClient({
  socket: {
    host: REDIS_HOST,
    port: Number(REDIS_PORT),
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      // Give up after 5 attempts so a genuinely unreachable Redis fails
      // startup instead of retrying forever. Once connected, this still
      // allows a handful of reconnect attempts if the connection drops.
      if (retries > 5) {
        return new Error('Could not connect to Redis after 5 attempts');
      }
      return Math.min(retries * 200, 2000);
    },
  },
});

redisClient.on('error', (err) => {
  console.error('[redis] client error:', err.message);
});

async function startServer() {
  try {
    await redisClient.connect();
    console.log(`[redis] connected successfully to ${REDIS_HOST}:${REDIS_PORT}`);
  } catch (err) {
    console.error(`[redis] failed to connect to ${REDIS_HOST}:${REDIS_PORT} -`, err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[server] url shortener listening on port ${PORT}`);
  });
}

function isValidUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

// POST /shorten
app.post('/shorten', async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid or missing "url". Must be a valid http/https URL.' });
    }

    const code = nanoid(6);
    await redisClient.set(code, url);

    return res.status(201).json({ shortUrl: `${BASE_URL}/${code}` });
  } catch (err) {
    console.error('[POST /shorten] error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /health (must be registered before the catch-all /:code route)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// GET /:code
app.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;

    if (!code || typeof code !== 'string') {
      return res.status(404).json({ error: 'Missing short code' });
    }

    const url = await redisClient.get(code);

    if (!url) {
      return res.status(404).json({ error: `No URL found for code "${code}"` });
    }

    return res.redirect(302, url);
  } catch (err) {
    console.error('[GET /:code] error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

startServer();

process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received, shutting down gracefully');
  const forceExit = setTimeout(() => process.exit(0), 3000);
  try {
    await redisClient.quit();
  } catch (err) {
    console.error('[redis] error during shutdown:', err.message);
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
});
