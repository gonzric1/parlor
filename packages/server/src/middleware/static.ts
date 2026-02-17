import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestHandler } from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function staticMiddleware(): RequestHandler[] | null {
  const clientDist = resolve(__dirname, '../../..', 'client/dist');
  if (!existsSync(clientDist)) return null;

  const indexHtml = readFileSync(join(clientDist, 'index.html'), 'utf-8');
  const serve = express.static(clientDist);

  // Single middleware that serves static files, then falls back to index.html for SPA routes
  const spaFallback: RequestHandler = (req, res, next) => {
    // Skip socket.io requests
    if (req.path.startsWith('/socket.io')) return next();

    // Try serving a static file first
    serve(req, res, () => {
      // No static file matched — serve index.html for SPA routing
      res.setHeader('Content-Type', 'text/html');
      res.send(indexHtml);
    });
  };

  return [spaFallback];
}
