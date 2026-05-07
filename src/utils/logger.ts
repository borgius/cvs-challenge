import { Logger } from '@aws-lambda-powertools/logger';

export const logger = new Logger({ serviceName: 'pr-concierge' });

export const accessLogger = (message: string, ...details: string[]): void => {
  logger.info(message, { logger: 'hono', details });
};
