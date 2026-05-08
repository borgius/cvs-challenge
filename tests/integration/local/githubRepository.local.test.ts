import { describe, expect, it } from 'vitest';

import {
  buildGitHubRepositoryApiUrl,
  buildGitHubRepositoryRawContentUrl,
  parseGitHubRepositoryFullName,
} from '../../../src/github/repository.ts';

describe('GitHub repository name helpers', () => {
  it('parses and encodes valid GitHub owner/repo names', () => {
    expect(parseGitHubRepositoryFullName('octo-org/pr.concierge_repo')).toEqual({
      owner: 'octo-org',
      repo: 'pr.concierge_repo',
      encodedOwner: 'octo-org',
      encodedRepo: 'pr.concierge_repo',
    });
    expect(
      buildGitHubRepositoryApiUrl(
        'octo-org/pr.concierge_repo',
        '/pulls/42/files?per_page=100&page=1',
      ),
    ).toBe(
      'https://api.github.com/repos/octo-org/pr.concierge_repo/pulls/42/files?per_page=100&page=1',
    );
  });

  it('builds raw-content URLs for branded assets pinned to a git ref', () => {
    expect(
      buildGitHubRepositoryRawContentUrl(
        'octo-org/pr.concierge_repo',
        'feature/check-branding',
        'diagrams/assets/pr-concierge-check-icon.png',
      ),
    ).toBe(
      'https://raw.githubusercontent.com/octo-org/pr.concierge_repo/feature/check-branding/diagrams/assets/pr-concierge-check-icon.png',
    );
  });

  it('rejects malformed repository full names before building GitHub API URLs', () => {
    expect(() => parseGitHubRepositoryFullName('octo-org/repo/extra')).toThrow(
      'Repository name must be in owner/repo format with GitHub-safe characters',
    );
    expect(() => parseGitHubRepositoryFullName('octo org/repo')).toThrow(
      'Repository name must be in owner/repo format with GitHub-safe characters',
    );
    expect(() => parseGitHubRepositoryFullName('octo-org/repo?admin=true')).toThrow(
      'Repository name must be in owner/repo format with GitHub-safe characters',
    );
  });
});
