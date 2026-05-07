import type { RiskAssessment, RiskLevel } from '../types/evaluation.ts';

interface RiskRule {
  area: string;
  riskLevel: RiskLevel;
  reason: string;
  matches: (filePath: string) => boolean;
}

const riskWeights: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const riskRules: RiskRule[] = [
  {
    area: 'terraform',
    riskLevel: 'high',
    reason: 'Infrastructure or Terraform changes can impact production environments quickly.',
    matches: (filePath) =>
      filePath.startsWith('infra/terraform/') ||
      filePath.startsWith('terraform/') ||
      filePath.endsWith('.tf'),
  },
  {
    area: 'iam',
    riskLevel: 'high',
    reason: 'IAM and policy changes deserve a platform review before merge.',
    matches: (filePath) =>
      filePath.includes('/iam/') ||
      filePath.includes('/polic') ||
      filePath.includes('permission'),
  },
  {
    area: 'ci',
    riskLevel: 'high',
    reason: 'CI/CD pipeline changes can affect releases and deployment safety.',
    matches: (filePath) => filePath.startsWith('.github/workflows/'),
  },
  {
    area: 'api',
    riskLevel: 'medium',
    reason: 'API and handler changes should get an extra application review pass.',
    matches: (filePath) =>
      filePath.startsWith('src/handlers/') ||
      filePath.startsWith('src/services/') ||
      filePath.includes('/api/'),
  },
  {
    area: 'tests',
    riskLevel: 'low',
    reason: 'Test-only changes are normally low risk.',
    matches: (filePath) =>
      filePath.includes('/test/') || filePath.includes('/tests/') || filePath.endsWith('.spec.ts'),
  },
  {
    area: 'docs',
    riskLevel: 'low',
    reason: 'Documentation-only changes are low risk.',
    matches: (filePath) => filePath.endsWith('.md') || filePath.startsWith('docs/'),
  },
];

const getTopLevelArea = (filePath: string): string => {
  const [topLevelArea] = filePath.split('/');

  if (!topLevelArea) {
    return 'root';
  }

  return topLevelArea.includes('.') ? 'root' : topLevelArea;
};

const promoteRisk = (currentRisk: RiskLevel, candidateRisk: RiskLevel): RiskLevel =>
  riskWeights[candidateRisk] > riskWeights[currentRisk] ? candidateRisk : currentRisk;

export const classifyPullRequestRisk = (changedFiles: string[]): RiskAssessment => {
  if (changedFiles.length === 0) {
    return {
      riskLevel: 'low',
      changedAreas: ['unknown'],
      reasons: ['No changed files were returned by the GitHub API.'],
    };
  }

  const changedAreas = new Set<string>();
  const reasons = new Set<string>();
  let riskLevel: RiskLevel = 'low';

  for (const filePath of changedFiles) {
    const normalizedPath = filePath.toLowerCase();
    const matchedRule = riskRules.find((rule) => rule.matches(normalizedPath));

    if (matchedRule) {
      changedAreas.add(matchedRule.area);
      reasons.add(matchedRule.reason);
      riskLevel = promoteRisk(riskLevel, matchedRule.riskLevel);
      continue;
    }

    changedAreas.add(getTopLevelArea(normalizedPath));
  }

  if (changedFiles.length >= 50) {
    riskLevel = 'high';
    reasons.add('Large pull requests are harder to review safely.');
  } else if (changedFiles.length >= 20 && riskLevel === 'low') {
    riskLevel = 'medium';
    reasons.add('Medium-size pull requests deserve a closer review pass.');
  }

  return {
    riskLevel,
    changedAreas: [...changedAreas].sort(),
    reasons: reasons.size > 0 ? [...reasons] : ['Only low-risk files were changed.'],
  };
};
