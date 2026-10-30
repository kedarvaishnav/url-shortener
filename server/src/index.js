import express from 'express';
import { nanoid } from 'nanoid';
import { createClient } from 'redis';

const PORT = Number(process.env.PORT || 3000);
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_DB = Number(process.env.REDIS_DB || 0);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const MAX_CODE_RETRIES = 5;
const CODE_PATTERN = /^[A-Za-z0-9_-]{6}$/;

const app = express();
const redisClient = createClient({
  socket: { host: REDIS_HOST, port: REDIS_PORT },
  database: REDIS_DB,
});

redisClient.on('error', (error) => {
  console.error('[redis] client error:', error.message);
});

app.use(express.json());

function isValidUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;

  try {
    const parsedUrl = new URL(value.trim());
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

async function saveUrl(url) {
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
    const code = nanoid(6);
    const saved = await redisClient.set(`url:${code}`, url, { NX: true });
    if (saved === 'OK') return code;
  }

  throw new Error('Could not generate a unique short code.');
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/shorten', async (req, res, next) => {
  const { url } = req.body || {};
  if (!isValidUrl(url)) {
    return res.status(400).json({
      error: 'Invalid or missing "url". Must be a valid http/https URL.',
    });
  }

  try {
    const code = await saveUrl(url.trim());
    return res.status(200).json({ shortUrl: `${BASE_URL}/${code}` });
  } catch (error) {
    return next(error);
  }
});

app.get('/:code', async (req, res, next) => {
  try {
    const url = await redisClient.get(`url:${req.params.code}`);
    if (!url) return res.status(404).json({ error: 'Not found' });
    return res.redirect(302, url);
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  console.error('[api] unexpected error:', error.message);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  await redisClient.connect();
  app.listen(PORT, () => {
    console.log(`[server] API listening on ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('[server] startup failed:', error.message);
  process.exitCode = 1;
});

process.on('SIGTERM', async () => {
  await redisClient.quit().catch((error) => {
    console.error('[redis] error during shutdown:', error.message);
  });
  process.exit(0);
});
