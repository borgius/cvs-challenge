import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DeploymentSummary {
  serviceName?: string;
  functionName?: string;
  roleName?: string;
  apiName?: string;
  apiId?: string;
  apiEndpoint?: string;
  healthUrl?: string;
  webhookUrl?: string;
  evaluationsTableName?: string;
  rawEventBucketName?: string | null;
  alarmTopicName?: string;
  lambdaLogGroupName?: string;
}

export interface LoadedDeploymentSummary extends DeploymentSummary {
  deploymentOutputPath: string;
  serviceName: string;
}

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const deployedUrlEnvKeys = {
  healthUrl: 'DEPLOYED_HEALTH_URL',
  webhookUrl: 'DEPLOYED_WEBHOOK_URL',
} as const;

const readDeploymentSummaryFile = (
  deploymentOutputPath: string,
): DeploymentSummary => {
  try {
    return JSON.parse(readFileSync(deploymentOutputPath, 'utf8')) as DeploymentSummary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Failed to read deployment summary from ${deploymentOutputPath}: ${message}`,
    );
  }
};

const normalizeOptionalUrl = (
  value: string | undefined,
  envName: string,
): string | undefined => {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  try {
    return new URL(trimmedValue).toString();
  } catch {
    throw new Error(
      `${envName} must be a valid absolute URL. Received '${trimmedValue}'.`,
    );
  }
};

export const getDeploymentOutputPath = (serviceName: string): string =>
  path.join(repoRoot, '.artifacts', `${serviceName}-deployment.json`);

export const loadDeploymentSummary = (): LoadedDeploymentSummary => {
  const serviceName = process.env.SERVICE_NAME?.trim() || 'pr-concierge';
  const deploymentOutputPath = getDeploymentOutputPath(serviceName);
  const healthUrlOverride = normalizeOptionalUrl(
    process.env.DEPLOYED_HEALTH_URL,
    'DEPLOYED_HEALTH_URL',
  );
  const webhookUrlOverride = normalizeOptionalUrl(
    process.env.DEPLOYED_WEBHOOK_URL,
    'DEPLOYED_WEBHOOK_URL',
  );
  const fileSummary = existsSync(deploymentOutputPath)
    ? readDeploymentSummaryFile(deploymentOutputPath)
    : {};

  return {
    ...fileSummary,
    serviceName,
    deploymentOutputPath,
    ...(healthUrlOverride ? { healthUrl: healthUrlOverride } : {}),
    ...(webhookUrlOverride ? { webhookUrl: webhookUrlOverride } : {}),
  };
};

export const resolveDeployedUrl = (
  urlKey: keyof typeof deployedUrlEnvKeys,
): string => {
  const deploymentSummary = loadDeploymentSummary();
  const value = deploymentSummary[urlKey];

  if (!value) {
    throw new Error(
      `Unable to resolve deployed ${urlKey}. Set ${deployedUrlEnvKeys[urlKey]} or create ${deploymentSummary.deploymentOutputPath} by running scripts/deploy.sh.`,
    );
  }

  try {
    return new URL(value).toString();
  } catch {
    throw new Error(
      `Resolved ${urlKey} must be a valid absolute URL. Received '${value}'.`,
    );
  }
};
