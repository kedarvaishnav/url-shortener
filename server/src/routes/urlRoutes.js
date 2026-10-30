import { Router } from 'express';
import { resolveCode, shortenUrl } from '../services/urlService.js';

const router = Router();

function isValidUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;

  try {
    const parsedUrl = new URL(value.trim());
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.post('/shorten', async (req, res, next) => {
  const { url } = req.body || {};
  if (!isValidUrl(url)) {
    return res.status(400).json({
      error: 'Invalid or missing "url". Must be a valid http/https URL.',
    });
  }

  try {
    const shortUrl = await shortenUrl(url.trim());
    return res.status(200).json({ shortUrl });
  } catch (error) {
    return next(error);
  }
});

router.get('/:code', async (req, res, next) => {
  try {
    const url = await resolveCode(req.params.code);
    if (!url) return res.status(404).json({ error: 'Not found' });
    return res.redirect(302, url);
  } catch (error) {
    return next(error);
  }
});

export { router as urlRoutes };
