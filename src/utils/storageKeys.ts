export const buildRawEventKey = (
  repositoryFullName: string,
  pullNumber: number,
  githubDeliveryId: string | undefined,
): string => {
  const safeRepositoryName = repositoryFullName.replace('/', '__');
  return `github/${safeRepositoryName}/${pullNumber}/${githubDeliveryId ?? Date.now().toString()}.json`;
};
