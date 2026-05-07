export type EvaluationRepositoryMode = 'console' | 'dynamodb';

export interface AppConfig {
  awsRegion: string;
  githubWebhookSecret: string;
  githubToken: string;
  evaluationsTableName: string;
  rawEventBucketName: string | undefined;
  enableRawEventArchive: boolean;
  requiredLabels: string[];
  evaluationRepository: EvaluationRepositoryMode;
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

const parseEvaluationRepository = (
  value: string | undefined,
): EvaluationRepositoryMode => {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue || normalizedValue === 'console') {
    return 'console';
  }

  if (normalizedValue === 'dynamodb') {
    return 'dynamodb';
  }

  throw new Error(
    `Invalid EVALUATION_REPOSITORY value '${value}'. Use 'console' or 'dynamodb'.`,
  );
};

export const loadAppConfig = (): AppConfig => ({
  awsRegion: process.env.AWS_REGION?.trim() || 'us-east-1',
  githubWebhookSecret: getRequiredEnv('GITHUB_WEBHOOK_SECRET'),
  githubToken: getRequiredEnv('GITHUB_TOKEN'),
  evaluationsTableName: getRequiredEnv('EVALUATIONS_TABLE_NAME'),
  rawEventBucketName: getOptionalEnv('RAW_EVENT_BUCKET_NAME'),
  enableRawEventArchive: parseBoolean(process.env.ENABLE_RAW_EVENT_ARCHIVE),
  requiredLabels: parseCsv(process.env.REQUIRED_LABELS),
  evaluationRepository: parseEvaluationRepository(process.env.EVALUATION_REPOSITORY),
});
