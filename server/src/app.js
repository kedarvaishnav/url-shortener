import express from 'express';
import { urlRoutes } from './routes/urlRoutes.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(urlRoutes);
  app.use((error, req, res, next) => {
    console.error('[api] unexpected error:', error.message);
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
