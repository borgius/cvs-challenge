export interface AppConfig {
  awsRegion: string;
  githubWebhookSecret: string;
  githubToken: string;
  evaluationsTableName: string;
  rawEventBucketName: string | undefined;
  enableRawEventArchive: boolean;
  requiredLabels: string[];
}

const getRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const getOptionalEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const parseBoolean = (value: string | undefined): boolean => value?.toLowerCase() === 'true';

const parseCsv = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

export const loadAppConfig = (): AppConfig => ({
  awsRegion: process.env.AWS_REGION?.trim() || 'us-east-1',
  githubWebhookSecret: getRequiredEnv('GITHUB_WEBHOOK_SECRET'),
  githubToken: getRequiredEnv('GITHUB_TOKEN'),
  evaluationsTableName: getRequiredEnv('EVALUATIONS_TABLE_NAME'),
  rawEventBucketName: getOptionalEnv('RAW_EVENT_BUCKET_NAME'),
  enableRawEventArchive: parseBoolean(process.env.ENABLE_RAW_EVENT_ARCHIVE),
  requiredLabels: parseCsv(process.env.REQUIRED_LABELS),
});
