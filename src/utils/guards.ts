import {
  supportedPullRequestActions,
  type SupportedPullRequestAction,
} from '../types/github.ts';

export const isSupportedPullRequestAction = (
  action: string,
): action is SupportedPullRequestAction =>
  supportedPullRequestActions.some((supportedAction) => supportedAction === action);
