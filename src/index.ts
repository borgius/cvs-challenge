import { serve } from '@hono/node-server';
import { handle } from 'hono/aws-lambda';
import { pathToFileURL } from 'node:url';

import { app } from './app.ts';
import { logger } from './utils/logger.ts';

export { app } from './app.ts';

export const handler = handle(app);

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypointUrl && import.meta.url === entrypointUrl) {
  const requestedPort = Number.parseInt(process.env.PORT ?? '3000', 10);
  const port = Number.isNaN(requestedPort) ? 3000 : requestedPort;
  const server = serve({
    fetch: app.fetch,
    port,
  });

  logger.info('PR Concierge Hono server started', { port, routes: ['GET /health', 'POST /webhooks/github'] });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info('PR Concierge Hono server stopping', { signal });

    server.close((error) => {
      if (error) {
        logger.error('Failed to stop PR Concierge Hono server cleanly', { signal, error: { name: error.name, message: error.message, stack: error.stack } });
        process.exit(1);
      }

      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
