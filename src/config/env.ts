export type EvaluationRepositoryMode = 'console' | 'dynamodb';

export interface AppConfig {
  awsRegion: string;
  githubWebhookSecret: string;
  githubToken: string | undefined;
  githubAppId: string | undefined;
  githubAppPrivateKey: string | undefined;
  githubAppInstallationId: number | undefined;
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

const parseOptionalPositiveInteger = (name: string): number | undefined => {
  const value = getOptionalEnv(name);

  if (!value) {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid ${name} value '${value}'. Use a positive integer.`);
  }

  return parsedValue;
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

const validateGitHubAuthConfig = (config: AppConfig): AppConfig => {
  const hasGitHubToken = Boolean(config.githubToken);
  const hasGitHubAppId = Boolean(config.githubAppId);
  const hasGitHubAppPrivateKey = Boolean(config.githubAppPrivateKey);

  if (hasGitHubAppId !== hasGitHubAppPrivateKey) {
    throw new Error(
      'Set both GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY to enable GitHub App authentication.',
    );
  }

  if (config.githubAppInstallationId !== undefined && !hasGitHubAppId) {
    throw new Error(
      'GITHUB_APP_INSTALLATION_ID requires GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.',
    );
  }

  if (!hasGitHubToken && !hasGitHubAppId) {
    throw new Error(
      'Missing GitHub authentication. Configure GITHUB_TOKEN or GitHub App credentials.',
    );
  }

  return config;
};

export const loadAppConfig = (): AppConfig =>
  validateGitHubAuthConfig({
    awsRegion: process.env.AWS_REGION?.trim() || 'us-east-1',
    githubWebhookSecret: getRequiredEnv('GITHUB_WEBHOOK_SECRET'),
    githubToken: getOptionalEnv('GITHUB_TOKEN'),
    githubAppId: getOptionalEnv('GITHUB_APP_ID'),
    githubAppPrivateKey: getOptionalEnv('GITHUB_APP_PRIVATE_KEY'),
    githubAppInstallationId: parseOptionalPositiveInteger('GITHUB_APP_INSTALLATION_ID'),
    evaluationsTableName: getRequiredEnv('EVALUATIONS_TABLE_NAME'),
    rawEventBucketName: getOptionalEnv('RAW_EVENT_BUCKET_NAME'),
    enableRawEventArchive: parseBoolean(process.env.ENABLE_RAW_EVENT_ARCHIVE),
    requiredLabels: parseCsv(process.env.REQUIRED_LABELS),
    evaluationRepository: parseEvaluationRepository(process.env.EVALUATION_REPOSITORY),
  });
