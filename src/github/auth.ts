import { createSign } from 'node:crypto';

import type { AppConfig } from '../config/env.ts';

const githubApiVersion = '2022-11-28';
const installationTokenRefreshSkewMs = 60_000;

interface GitHubInstallationResponse {
  id: number;
}

interface GitHubInstallationTokenResponse {
  token: string;
  expires_at: string;
}

interface CachedInstallationToken {
  token: string;
  expiresAtEpochMs: number;
}

const installationIdCache = new Map<string, string>();
const installationTokenCache = new Map<string, CachedInstallationToken>();

export const resetGitHubAuthCacheForTests = (): void => {
  installationIdCache.clear();
  installationTokenCache.clear();
};

const parseRepositoryFullName = (
  repositoryFullName: string,
): { owner: string; repo: string } => {
  const [owner, repo] = repositoryFullName.split('/');

  if (!owner || !repo) {
    throw new Error(
      `Repository name must be in owner/repo format: ${repositoryFullName}`,
    );
  }

  return { owner, repo };
};

const normalizeGitHubAppPrivateKey = (privateKey: string): string =>
  privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;

const buildGitHubHeaders = (
  token: string,
  includeContentType = false,
): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'user-agent': 'pr-concierge',
  'x-github-api-version': githubApiVersion,
  ...(includeContentType ? { 'content-type': 'application/json' } : {}),
});

const readGitHubErrorText = async (response: Response): Promise<string> => {
  const responseText = await response.text();
  return responseText ? `: ${responseText}` : '';
};

const buildGitHubAppJwt = (
  appId: string,
  privateKey: string,
): string => {
  const issuedAt = Math.floor(Date.now() / 1000) - 60;
  const expiresAt = issuedAt + (9 * 60);
  const encodedHeader = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
  const encodedPayload = Buffer.from(
    JSON.stringify({ iat: issuedAt, exp: expiresAt, iss: appId }),
  ).toString('base64url');
  const signer = createSign('RSA-SHA256');
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  signer.update(unsignedToken);
  signer.end();

  const signature = signer
    .sign(normalizeGitHubAppPrivateKey(privateKey))
    .toString('base64url');

  return `${unsignedToken}.${signature}`;
};

const hasGitHubAppCredentials = (
  config: Pick<AppConfig, 'githubAppId' | 'githubAppPrivateKey'>,
): boolean => Boolean(config.githubAppId && config.githubAppPrivateKey);

const resolveGitHubAppInstallationId = async (
  config: Pick<AppConfig, 'githubAppId' | 'githubAppInstallationId' | 'githubAppPrivateKey'>,
  repositoryFullName: string,
): Promise<string> => {
  if (config.githubAppInstallationId !== undefined) {
    return String(config.githubAppInstallationId);
  }

  const cachedInstallationId = installationIdCache.get(repositoryFullName);

  if (cachedInstallationId) {
    return cachedInstallationId;
  }

  if (!config.githubAppId || !config.githubAppPrivateKey) {
    throw new Error(
      'GitHub App credentials are required to resolve the repository installation ID.',
    );
  }

  const { owner, repo } = parseRepositoryFullName(repositoryFullName);
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/installation`,
    {
      headers: buildGitHubHeaders(
        buildGitHubAppJwt(config.githubAppId, config.githubAppPrivateKey),
      ),
    },
  );

  if (response.status === 404) {
    throw new Error(
      `GitHub App is not installed on ${repositoryFullName}. Install the app on the repository or configure GITHUB_APP_INSTALLATION_ID explicitly.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `GitHub App installation lookup failed for ${repositoryFullName} with status ${response.status}${await readGitHubErrorText(response)}`,
    );
  }

  const installation = (await response.json()) as GitHubInstallationResponse;
  const installationId = String(installation.id);

  installationIdCache.set(repositoryFullName, installationId);

  return installationId;
};

const createGitHubAppInstallationToken = async (
  config: Pick<AppConfig, 'githubAppId' | 'githubAppInstallationId' | 'githubAppPrivateKey'>,
  repositoryFullName: string,
): Promise<string> => {
  if (!config.githubAppId || !config.githubAppPrivateKey) {
    throw new Error(
      'GitHub App credentials are required to mint an installation token.',
    );
  }

  const installationId = await resolveGitHubAppInstallationId(
    config,
    repositoryFullName,
  );
  const cachedToken = installationTokenCache.get(installationId);

  if (
    cachedToken &&
    cachedToken.expiresAtEpochMs - Date.now() > installationTokenRefreshSkewMs
  ) {
    return cachedToken.token;
  }

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: buildGitHubHeaders(
        buildGitHubAppJwt(config.githubAppId, config.githubAppPrivateKey),
        true,
      ),
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub App installation token request failed for installation ${installationId} with status ${response.status}${await readGitHubErrorText(response)}`,
    );
  }

  const installationToken = (await response.json()) as GitHubInstallationTokenResponse;
  const expiresAtEpochMs = Date.parse(installationToken.expires_at);

  installationTokenCache.set(installationId, {
    token: installationToken.token,
    expiresAtEpochMs: Number.isNaN(expiresAtEpochMs)
      ? Date.now() + (55 * 60 * 1000)
      : expiresAtEpochMs,
  });

  return installationToken.token;
};

export const getGitHubRepositoryReadToken = async (
  config: Pick<AppConfig, 'githubAppId' | 'githubAppInstallationId' | 'githubAppPrivateKey' | 'githubToken'>,
  repositoryFullName: string,
): Promise<string> => {
  if (config.githubToken) {
    return config.githubToken;
  }

  if (hasGitHubAppCredentials(config)) {
    return createGitHubAppInstallationToken(config, repositoryFullName);
  }

  throw new Error(
    'Missing GitHub repository authentication. Configure GITHUB_TOKEN or GitHub App credentials.',
  );
};

export const getGitHubChecksWriteToken = async (
  config: Pick<AppConfig, 'githubAppId' | 'githubAppInstallationId' | 'githubAppPrivateKey'>,
  repositoryFullName: string,
): Promise<string> => {
  if (!hasGitHubAppCredentials(config)) {
    throw new Error(
      'GitHub check publication requires GitHub App authentication. Configure GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY, and optionally GITHUB_APP_INSTALLATION_ID.',
    );
  }

  return createGitHubAppInstallationToken(config, repositoryFullName);
};