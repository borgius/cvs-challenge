import type { CheckStatus, EvaluationCheck, EvaluationResult } from '../types/evaluation.ts';
import {
  buildGitHubRepositoryApiUrl,
  buildGitHubRepositoryRawContentUrl,
} from './repository.ts';

const githubApiVersion = '2022-11-28';
const checkRunName = 'pr-concierge';
const checkBrandingAssetPath = 'diagrams/assets/pr-concierge-check-icon.png';

export type GitHubCheckRunConclusion =
  | 'action_required'
  | 'cancelled'
  | 'failure'
  | 'neutral'
  | 'skipped'
  | 'success'
  | 'timed_out';

export interface GitHubCheckRunOutput {
  title: string;
  summary: string;
  text?: string;
  images?: GitHubCheckRunImage[];
}

export interface GitHubCheckRunImage {
  alt: string;
  image_url: string;
  caption?: string;
}

export interface CreateGitHubCheckRunInput {
  repositoryFullName: string;
  githubToken: string;
  headSha: string;
  externalId: string;
  brandingImageUrl?: string;
}

export interface CompleteGitHubCheckRunInput {
  repositoryFullName: string;
  githubToken: string;
  checkRunId: number;
  conclusion: GitHubCheckRunConclusion;
  output: GitHubCheckRunOutput;
}

interface GitHubCheckRunResponse {
  id: number;
  html_url?: string;
}

interface GitHubCheckStatusCounts {
  pass: number;
  fail: number;
  warn: number;
  skip: number;
}

const buildCheckRunImages = (
  brandingImageUrl: string | undefined,
): GitHubCheckRunImage[] | undefined =>
  brandingImageUrl
    ? [
        {
          alt: 'PR Concierge branded check artwork',
          image_url: brandingImageUrl,
          caption:
            'PR Concierge saves the evaluation and publishes this GitHub check back to the pull request.',
        },
      ]
    : undefined;

const buildOptionalImagesProperty = (
  brandingImageUrl: string | undefined,
): Pick<GitHubCheckRunOutput, 'images'> | Record<string, never> => {
  const images = buildCheckRunImages(brandingImageUrl);

  return images === undefined ? {} : { images };
};

const buildGitHubHeaders = (githubToken: string): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${githubToken}`,
  'content-type': 'application/json',
  'user-agent': 'pr-concierge',
  'x-github-api-version': githubApiVersion,
});

const readGitHubErrorText = async (response: Response): Promise<string> => {
  const responseText = await response.text();
  return responseText ? `: ${responseText}` : '';
};

const requestGitHubCheckRun = async <T>(
  repositoryFullName: string,
  githubToken: string,
  path: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch(buildGitHubRepositoryApiUrl(repositoryFullName, path), {
    method,
    headers: buildGitHubHeaders(githubToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub Checks API ${method} ${path} failed with status ${response.status}${await readGitHubErrorText(response)}`,
    );
  }

  return (await response.json()) as T;
};

const buildInProgressOutput = (
  brandingImageUrl: string | undefined,
): GitHubCheckRunOutput => ({
  title: 'PR Concierge is evaluating this pull request',
  summary:
    'Checking branch naming, labels, changed files, and the CVS phrase rule before saving the result and updating the PR check.',
  ...buildOptionalImagesProperty(brandingImageUrl),
});

const countCheckStatuses = (checks: EvaluationCheck[]): GitHubCheckStatusCounts => {
  const counts: GitHubCheckStatusCounts = {
    pass: 0,
    fail: 0,
    warn: 0,
    skip: 0,
  };

  for (const check of checks) {
    counts[check.status as CheckStatus] += 1;
  }

  return counts;
};

const formatChangedAreas = (changedAreas: string[]): string =>
  changedAreas.length > 0 ? changedAreas.join(', ') : 'none detected';

const formatCheckCounts = (counts: GitHubCheckStatusCounts): string =>
  `${counts.pass} passed, ${counts.fail} failed, ${counts.warn} warned, ${counts.skip} skipped`;

const formatCheckLine = (check: EvaluationCheck): string =>
  `- ${check.name}: ${check.status} — ${check.details}`;

const buildConclusionTitle = (
  conclusion: GitHubCheckRunConclusion,
): string => {
  switch (conclusion) {
    case 'failure':
      return 'PR Concierge found issues';
    case 'neutral':
      return 'PR Concierge finished with warnings';
    case 'skipped':
      return 'PR Concierge skipped this pull request';
    default:
      return 'PR Concierge passed';
  }
};

export const buildGitHubCheckExternalId = (
  repositoryFullName: string,
  pullNumber: number,
  headSha: string,
  githubDeliveryId: string | undefined,
): string =>
  githubDeliveryId ?? `${repositoryFullName}#${pullNumber}@${headSha}`;

export const buildGitHubCheckBrandingImageUrl = (
  repositoryFullName: string,
  gitRef: string,
): string =>
  buildGitHubRepositoryRawContentUrl(
    repositoryFullName,
    gitRef,
    checkBrandingAssetPath,
  );

export const createGitHubCheckRun = async (
  input: CreateGitHubCheckRunInput,
): Promise<GitHubCheckRunResponse> =>
  requestGitHubCheckRun<GitHubCheckRunResponse>(
    input.repositoryFullName,
    input.githubToken,
    '/check-runs',
    'POST',
    {
      name: checkRunName,
      head_sha: input.headSha,
      status: 'in_progress',
      external_id: input.externalId,
      started_at: new Date().toISOString(),
      output: buildInProgressOutput(input.brandingImageUrl),
    },
  );

export const deriveGitHubCheckConclusion = (
  evaluation: EvaluationResult,
): GitHubCheckRunConclusion => {
  if (evaluation.checks.some((check) => check.status === 'fail')) {
    return 'failure';
  }

  if (evaluation.checks.some((check) => check.status === 'warn')) {
    return 'neutral';
  }

  if (evaluation.checks.every((check) => check.status === 'skip')) {
    return 'skipped';
  }

  return 'success';
};

export const buildCompletedGitHubCheckOutput = (
  evaluation: EvaluationResult,
  brandingImageUrl?: string,
): GitHubCheckRunOutput => {
  const conclusion = deriveGitHubCheckConclusion(evaluation);
  const counts = countCheckStatuses(evaluation.checks);

  return {
    title: buildConclusionTitle(conclusion),
    summary: [
      `Checks: ${formatCheckCounts(counts)}`,
      `Risk: ${evaluation.riskAssessment.riskLevel}`,
      `Changed areas: ${formatChangedAreas(evaluation.riskAssessment.changedAreas)}`,
      `Next step: ${evaluation.nextStep}`,
    ].join('\n'),
    text: [
      'Evaluation summary',
      evaluation.summary,
      '',
      'Deterministic checks',
      ...evaluation.checks.map(formatCheckLine),
    ].join('\n'),
    ...buildOptionalImagesProperty(brandingImageUrl),
  };
};

export const buildFailedGitHubCheckOutput = (
  requestId: string,
  brandingImageUrl?: string,
): GitHubCheckRunOutput => ({
  title: 'PR Concierge could not finish',
  summary: [
    'PR Concierge started this evaluation but failed before it could complete.',
    `Request ID: ${requestId}`,
  ].join('\n'),
  text:
    'Check the service logs for the matching request ID to inspect the failure details.',
  ...buildOptionalImagesProperty(brandingImageUrl),
});

export const completeGitHubCheckRun = async (
  input: CompleteGitHubCheckRunInput,
): Promise<GitHubCheckRunResponse> =>
  requestGitHubCheckRun<GitHubCheckRunResponse>(
    input.repositoryFullName,
    input.githubToken,
    `/check-runs/${input.checkRunId}`,
    'PATCH',
    {
      name: checkRunName,
      status: 'completed',
      conclusion: input.conclusion,
      completed_at: new Date().toISOString(),
      output: input.output,
    },
  );