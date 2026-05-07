import { classifyPullRequestRisk } from '../risk/classifier.ts';
import type { EvaluationRepository } from '../storage/evaluationRepository.ts';
import type { EvaluationCheck, EvaluationRecord, EvaluationResult, RiskLevel } from '../types/evaluation.ts';

const branchNamePattern = /^(feature|fix|chore|docs|hotfix|release)\/[a-z0-9._-]+$/;

export interface EvaluatePullRequestInput {
  action: string;
  repositoryFullName: string;
  pullNumber: number;
  branchName: string;
  baseBranch: string;
  headSha: string | undefined;
  changedFiles: string[];
  labels: string[];
  requiredLabels: string[];
  githubDeliveryId: string | undefined;
  rawEventS3Key: string | undefined;
  repository: EvaluationRepository;
}

const buildBranchNameCheck = (branchName: string): EvaluationCheck => ({
  name: 'branch naming',
  status: branchNamePattern.test(branchName) ? 'pass' : 'fail',
  details: branchNamePattern.test(branchName)
    ? 'Branch matches the platform naming convention.'
    : 'Use a branch such as feature/my-change or fix/bug-name.',
});

const buildRequiredLabelsCheck = (
  labels: string[],
  requiredLabels: string[],
): EvaluationCheck => {
  if (requiredLabels.length === 0) {
    return {
      name: 'required labels',
      status: 'skip',
      details: 'No required labels are configured.',
    };
  }

  const presentLabels = new Set(labels.map((label) => label.toLowerCase()));
  const missingLabels = requiredLabels.filter(
    (label) => !presentLabels.has(label.toLowerCase()),
  );

  return missingLabels.length === 0
    ? {
        name: 'required labels',
        status: 'pass',
        details: 'All required labels are present.',
      }
    : {
        name: 'required labels',
        status: 'fail',
        details: `Missing required labels: ${missingLabels.join(', ')}`,
      };
};

const determineNextStep = (checks: EvaluationCheck[], riskLevel: RiskLevel): string => {
  const blockingCheck = checks.find((check) => check.status === 'fail');

  if (blockingCheck) {
    return blockingCheck.name === 'branch naming'
      ? 'rename the branch to match the platform convention'
      : 'add the required labels before merge';
  }

  if (riskLevel === 'high') {
    return 'platform review required';
  }

  if (riskLevel === 'medium') {
    return 'review the touched areas carefully before merge';
  }

  return 'standard review path';
};

const buildRecord = (
  input: EvaluatePullRequestInput,
  checks: EvaluationCheck[],
  summary: string,
  riskLevel: RiskLevel,
  createdAt: string,
): EvaluationRecord => {
  const record: EvaluationRecord = {
    pk: `${input.repositoryFullName}#${input.pullNumber}`,
    sk: input.githubDeliveryId ?? createdAt,
    action: input.action,
    branch_name: input.branchName,
    base_branch: input.baseBranch,
    changed_files: [...input.changedFiles].sort(),
    risk_level: riskLevel,
    checks,
    summary,
    created_at: createdAt,
    repository_full_name: input.repositoryFullName,
  };

  if (input.rawEventS3Key) {
    record.raw_event_s3_key = input.rawEventS3Key;
  }

  if (input.githubDeliveryId) {
    record.github_delivery_id = input.githubDeliveryId;
  }

  if (input.headSha) {
    record.head_sha = input.headSha;
  }

  return record;
};

export const evaluatePullRequest = async (
  input: EvaluatePullRequestInput,
): Promise<EvaluationResult> => {
  const riskAssessment = classifyPullRequestRisk(input.changedFiles);
  const branchNameCheck = buildBranchNameCheck(input.branchName);
  const requiredLabelsCheck = buildRequiredLabelsCheck(
    input.labels,
    input.requiredLabels,
  );
  const checks: [EvaluationCheck, EvaluationCheck] = [
    branchNameCheck,
    requiredLabelsCheck,
  ];
  const nextStep = determineNextStep(checks, riskAssessment.riskLevel);
  const summary = [
    `risk: ${riskAssessment.riskLevel}`,
    `branch naming: ${branchNameCheck.status}`,
    `changed areas: ${riskAssessment.changedAreas.join(', ')}`,
    `next step: ${nextStep}`,
  ].join('\n');
  const createdAt = new Date().toISOString();
  const record = buildRecord(
    input,
    checks,
    summary,
    riskAssessment.riskLevel,
    createdAt,
  );

  await input.repository.saveEvaluation(record);

  return {
    summary,
    checks,
    riskAssessment,
    record,
  };
};
