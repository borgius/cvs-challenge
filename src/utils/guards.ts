import {
  supportedPullRequestActions,
  type PullRequestLabel,
  type PullRequestPayload,
  type SupportedPullRequestAction,
} from '../types/github.ts';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isPullRequestLabelArray = (value: unknown): value is PullRequestLabel[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.name === 'string');

export const isPullRequestPayload = (value: unknown): value is PullRequestPayload => {
  if (!isRecord(value)) {
    return false;
  }

  const repository = value.repository;
  const pullRequest = value.pull_request;

  if (!isRecord(repository) || !isRecord(pullRequest)) {
    return false;
  }

  const head = pullRequest.head;
  const base = pullRequest.base;
  const labels = pullRequest.labels;

  return (
    typeof value.action === 'string' &&
    typeof repository.full_name === 'string' &&
    isRecord(head) &&
    typeof head.ref === 'string' &&
    (head.sha === undefined || typeof head.sha === 'string') &&
    isRecord(base) &&
    typeof base.ref === 'string' &&
    (labels === undefined || isPullRequestLabelArray(labels))
  );
};

export const isSupportedPullRequestAction = (
  action: string,
): action is SupportedPullRequestAction =>
  supportedPullRequestActions.some((supportedAction) => supportedAction === action);
