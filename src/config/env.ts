import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

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

type GitHubConfigValueKey =
  | 'githubWebhookSecret'
  | 'githubToken'
  | 'githubAppId'
  | 'githubAppPrivateKey'
  | 'githubAppInstallationId';

interface GitHubSsmBinding {
  directEnvName: string;
  parameterEnvName: string;
}

type SsmParameterLoader = (
  awsRegion: string,
  parameterNames: string[],
) => Promise<Map<string, string>>;

const githubSsmBindings: Record<GitHubConfigValueKey, GitHubSsmBinding> = {
  githubWebhookSecret: {
    directEnvName: 'GITHUB_WEBHOOK_SECRET',
    parameterEnvName: 'GITHUB_WEBHOOK_SECRET_SSM_PARAMETER_NAME',
  },
  githubToken: {
    directEnvName: 'GITHUB_TOKEN',
    parameterEnvName: 'GITHUB_TOKEN_SSM_PARAMETER_NAME',
  },
  githubAppId: {
    directEnvName: 'GITHUB_APP_ID',
    parameterEnvName: 'GITHUB_APP_ID_SSM_PARAMETER_NAME',
  },
  githubAppPrivateKey: {
    directEnvName: 'GITHUB_APP_PRIVATE_KEY',
    parameterEnvName: 'GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER_NAME',
  },
  githubAppInstallationId: {
    directEnvName: 'GITHUB_APP_INSTALLATION_ID',
    parameterEnvName: 'GITHUB_APP_INSTALLATION_ID_SSM_PARAMETER_NAME',
  },
};

const ssmClients = new Map<string, SSMClient>();

let appConfigPromise: Promise<AppConfig> | undefined;

const getSsmClient = (awsRegion: string): SSMClient => {
  const existingClient = ssmClients.get(awsRegion);

  if (existingClient) {
    return existingClient;
  }

  const client = new SSMClient({ region: awsRegion });
  ssmClients.set(awsRegion, client);
  return client;
};

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

const parseOptionalPositiveIntegerValue = (
  name: string,
  value: string | undefined,
): number | undefined => {
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

const defaultSsmParameterLoader: SsmParameterLoader = async (
  awsRegion,
  parameterNames,
): Promise<Map<string, string>> => {
  const uniqueParameterNames = [...new Set(parameterNames)];

  if (uniqueParameterNames.length === 0) {
    return new Map<string, string>();
  }

  const response = await getSsmClient(awsRegion).send(
    new GetParametersCommand({
      Names: uniqueParameterNames,
      WithDecryption: true,
    }),
  );

  const invalidParameters = response.InvalidParameters ?? [];

  if (invalidParameters.length > 0) {
    throw new Error(
      `Missing SSM parameters: ${invalidParameters.join(', ')}.`,
    );
  }

  return new Map(
    (response.Parameters ?? []).flatMap((parameter) =>
      parameter.Name && parameter.Value
        ? ([[parameter.Name, parameter.Value]] as const)
        : [],
    ),
  );
};

let ssmParameterLoader: SsmParameterLoader = defaultSsmParameterLoader;

const getRequiredGitHubConfigValue = (
  value: string | undefined,
  directEnvName: string,
  parameterEnvName: string,
): string => {
  if (!value) {
    throw new Error(
      `Missing GitHub configuration. Set ${directEnvName} or ${parameterEnvName}.`,
    );
  }

  return value;
};

const loadResolvedGitHubConfigValues = async (
  awsRegion: string,
): Promise<Record<GitHubConfigValueKey, string | undefined>> => {
  const parameterNamesToLoad = Object.values(githubSsmBindings)
    .map((binding) => getOptionalEnv(binding.parameterEnvName))
    .filter((parameterName): parameterName is string => parameterName !== undefined);
  const parameterValues = await ssmParameterLoader(awsRegion, parameterNamesToLoad);
  const resolvedValues = {} as Record<GitHubConfigValueKey, string | undefined>;

  for (const [key, binding] of Object.entries(githubSsmBindings) as Array<
    [GitHubConfigValueKey, GitHubSsmBinding]
  >) {
    const directValue = getOptionalEnv(binding.directEnvName);

    if (directValue !== undefined) {
      resolvedValues[key] = directValue;
      continue;
    }

    const parameterName = getOptionalEnv(binding.parameterEnvName);

    if (!parameterName) {
      resolvedValues[key] = undefined;
      continue;
    }

    const parameterValue = parameterValues.get(parameterName)?.trim();

    if (!parameterValue) {
      throw new Error(`Missing value for SSM parameter: ${parameterName}.`);
    }

    resolvedValues[key] = parameterValue;
  }

  return resolvedValues;
};

const loadAppConfigUncached = async (): Promise<AppConfig> => {
  const awsRegion = process.env.AWS_REGION?.trim() || 'us-east-1';
  const githubConfigValues = await loadResolvedGitHubConfigValues(awsRegion);

  return validateGitHubAuthConfig({
    awsRegion,
    githubWebhookSecret: getRequiredGitHubConfigValue(
      githubConfigValues.githubWebhookSecret,
      githubSsmBindings.githubWebhookSecret.directEnvName,
      githubSsmBindings.githubWebhookSecret.parameterEnvName,
    ),
    githubToken: githubConfigValues.githubToken,
    githubAppId: githubConfigValues.githubAppId,
    githubAppPrivateKey: githubConfigValues.githubAppPrivateKey,
    githubAppInstallationId: parseOptionalPositiveIntegerValue(
      'GITHUB_APP_INSTALLATION_ID',
      githubConfigValues.githubAppInstallationId,
    ),
    evaluationsTableName: getRequiredEnv('EVALUATIONS_TABLE_NAME'),
    rawEventBucketName: getOptionalEnv('RAW_EVENT_BUCKET_NAME'),
    enableRawEventArchive: parseBoolean(process.env.ENABLE_RAW_EVENT_ARCHIVE),
    requiredLabels: parseCsv(process.env.REQUIRED_LABELS),
    evaluationRepository: parseEvaluationRepository(process.env.EVALUATION_REPOSITORY),
  });
};

export const loadAppConfig = (): Promise<AppConfig> => {
  if (!appConfigPromise) {
    appConfigPromise = loadAppConfigUncached().catch((error) => {
      appConfigPromise = undefined;
      throw error;
    });
  }

  return appConfigPromise;
};

export const setSsmParameterLoaderForTests = (
  loader: SsmParameterLoader,
): void => {
  ssmParameterLoader = loader;
  appConfigPromise = undefined;
};

export const resetAppConfigCacheForTests = (): void => {
  appConfigPromise = undefined;
  ssmParameterLoader = defaultSsmParameterLoader;
  ssmClients.clear();
};
