export type RiskLevel = 'low' | 'medium' | 'high';
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface EvaluationCheck {
  name: string;
  status: CheckStatus;
  details: string;
}

export interface RiskAssessment {
  riskLevel: RiskLevel;
  changedAreas: string[];
  reasons: string[];
}

export interface EvaluationRecord {
  pk: string;
  sk: string;
  action: string;
  branch_name: string;
  base_branch: string;
  changed_files: string[];
  risk_level: RiskLevel;
  checks: EvaluationCheck[];
  summary: string;
  created_at: string;
  raw_event_s3_key?: string;
  github_delivery_id?: string;
  repository_full_name: string;
  head_sha?: string;
}

export interface EvaluationResult {
  summary: string;
  checks: EvaluationCheck[];
  riskAssessment: RiskAssessment;
  record: EvaluationRecord;
}
