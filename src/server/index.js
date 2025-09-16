import express from 'express';
import path from 'path';
import { config } from '../config/index.js';

export function createServer() {
  const app = express();
  
  app.use(express.static(config.paths.dataDir));

  app.get('/health', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));
  
  // Consolidated errors endpoint
  app.get('/errors', (_req, res) => {
    const errorsFile = path.join(config.paths.dataDir, 'errors.json');
    res.sendFile(errorsFile, (err) => {
      if (err) {
        res.status(404).json({ error: 'No errors data available yet' });
      }
    });
  });
  
  app.get('/', (_req, res) => {
    res.type('text/plain').send(
      `Datadog Errors Monitor\n\n` +
      `Consolidated errors: /errors\n` +
      `Health check: /health\n` +
      `Raw data folder: / (data directory)\n\n` +
      `The /errors endpoint provides a single JSON file with all errors\n` +
      `and summary statistics for easy monitoring and integration.\n`
    );
  });

  return app;
}

export function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(config.server.port, () => {
      console.log(`Serving ${config.paths.dataDir} at http://localhost:${config.server.port}`);
      resolve(server);
    });
  });
}
