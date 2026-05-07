export const accessLogger = (message: string, ...details: string[]): void => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      logger: 'hono',
      message,
      details,
    }),
  );
};
