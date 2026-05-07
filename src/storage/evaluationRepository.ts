import type { EvaluationRecord } from '../types/evaluation.ts';

export interface EvaluationRepository {
  saveEvaluation(record: EvaluationRecord): Promise<void>;
}

export class ConsoleEvaluationRepository implements EvaluationRepository {
  async saveEvaluation(record: EvaluationRecord): Promise<void> {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Persisting evaluation record placeholder',
        repositoryFullName: record.repository_full_name,
        action: record.action,
        riskLevel: record.risk_level,
        evaluationRecord: record,
      }),
    );
  }
}
