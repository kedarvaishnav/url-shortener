import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { urlRoutes } from './routes/urlRoutes.js';

const PUBLIC_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../public',
);

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(PUBLIC_DIRECTORY));
  app.use(urlRoutes);
  app.use((error, req, res, next) => {
    console.error('[api] unexpected error:', error.message);
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
