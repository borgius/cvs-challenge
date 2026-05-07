import type { PullRequestFile } from '../types/github.ts';

const githubApiVersion = '2022-11-28';
const filesPerPage = 100;

const parseRepositoryFullName = (repositoryFullName: string): { owner: string; repo: string } => {
  const [owner, repo] = repositoryFullName.split('/');

  if (!owner || !repo) {
    throw new Error(`Repository name must be in owner/repo format: ${repositoryFullName}`);
  }

  return { owner, repo };
};

export const fetchPullRequestFiles = async (
  repositoryFullName: string,
  pullNumber: number,
  githubToken: string,
): Promise<PullRequestFile[]> => {
  const { owner, repo } = parseRepositoryFullName(repositoryFullName);
  const files: PullRequestFile[] = [];

  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=${filesPerPage}&page=${page}`,
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
