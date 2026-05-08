const gitHubOwnerPattern = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?';
const gitHubRepositoryPattern = '[A-Za-z0-9._-]+';
const gitHubRepositoryFullNamePattern = new RegExp(
  `^(${gitHubOwnerPattern})\/(${gitHubRepositoryPattern})$`,
);

export interface GitHubRepositoryNameParts {
  owner: string;
  repo: string;
  encodedOwner: string;
  encodedRepo: string;
}

export const parseGitHubRepositoryFullName = (
  repositoryFullName: string,
): GitHubRepositoryNameParts => {
  const match = gitHubRepositoryFullNamePattern.exec(repositoryFullName);

  if (!match?.[1] || !match[2]) {
    throw new Error(
      `Repository name must be in owner/repo format with GitHub-safe characters: ${repositoryFullName}`,
    );
  }

  const [, owner, repo] = match;

  return {
    owner,
    repo,
    encodedOwner: encodeURIComponent(owner),
    encodedRepo: encodeURIComponent(repo),
  };
};

export const buildGitHubRepositoryApiUrl = (
  repositoryFullName: string,
  path: string,
): string => {
  const { encodedOwner, encodedRepo } = parseGitHubRepositoryFullName(
    repositoryFullName,
  );

  return `https://api.github.com/repos/${encodedOwner}/${encodedRepo}${path}`;
};
