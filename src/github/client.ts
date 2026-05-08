import type { PullRequestFile } from '../types/github.ts';
import { buildGitHubRepositoryApiUrl } from './repository.ts';

const githubApiVersion = '2022-11-28';
const filesPerPage = 100;

export const fetchPullRequestFiles = async (
  repositoryFullName: string,
  pullNumber: number,
  githubToken: string,
): Promise<PullRequestFile[]> => {
  const files: PullRequestFile[] = [];

  for (let page = 1; ; page += 1) {
    const response = await fetch(
      buildGitHubRepositoryApiUrl(
        repositoryFullName,
        `/pulls/${pullNumber}/files?per_page=${filesPerPage}&page=${page}`,
      ),
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${githubToken}`,
          'user-agent': 'pr-concierge',
          'x-github-api-version': githubApiVersion,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `GitHub API request failed with status ${response.status}: ${await response.text()}`,
      );
    }

    const pageFiles = (await response.json()) as PullRequestFile[];
    files.push(...pageFiles);

    if (pageFiles.length < filesPerPage) {
      break;
    }
  }

  return files;
};
