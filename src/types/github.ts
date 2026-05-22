export const supportedPullRequestActions = ['opened', 'synchronize', 'reopened'] as const;

export type SupportedPullRequestAction = (typeof supportedPullRequestActions)[number];

export interface PullRequestLabel {
  name: string;
}

export interface PullRequestRef {
  ref: string;
  sha?: string;
}

export interface PullRequestPayload {
  action: string;
  number?: number;
  pull_request: {
    number?: number;
    title: string;
    body: string | null;
    head: PullRequestRef;
    base: PullRequestRef;
    labels?: PullRequestLabel[];
  };
  repository: {
    full_name: string;
    default_branch?: string;
    private?: boolean;
    owner?: {
      login: string;
    };
    name?: string;
  };
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}
