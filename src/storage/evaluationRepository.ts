import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import type { EvaluationRepositoryMode } from '../config/env.ts';
import type { EvaluationRecord } from '../types/evaluation.ts';
import { logger } from '../utils/logger.ts';

export interface EvaluationRepository {
  saveEvaluation(record: EvaluationRecord): Promise<void>;
}

export interface EvaluationRepositoryConfig {
  awsRegion: string;
  evaluationsTableName: string;
  evaluationRepository: EvaluationRepositoryMode;
}

const documentClients = new Map<string, DynamoDBDocumentClient>();

const getDocumentClient = (awsRegion: string): DynamoDBDocumentClient => {
  const existingClient = documentClients.get(awsRegion);

  if (existingClient) {
    return existingClient;
  }

  const documentClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: awsRegion,
    }),
  );

  documentClients.set(awsRegion, documentClient);
  return documentClient;
};

export class ConsoleEvaluationRepository implements EvaluationRepository {
  async saveEvaluation(record: EvaluationRecord): Promise<void> {
    logger.info('Persisting evaluation record placeholder', {
      repositoryFullName: record.repository_full_name,
      action: record.action,
      riskLevel: record.risk_level,
      evaluationRecord: record,
    });
  }
}

export class DynamoDbEvaluationRepository implements EvaluationRepository {
  private readonly tableName: string;
  private readonly documentClient: DynamoDBDocumentClient;

  constructor(tableName: string, documentClient: DynamoDBDocumentClient) {
    this.tableName = tableName;
    this.documentClient = documentClient;
  }

  async saveEvaluation(record: EvaluationRecord): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
      }),
    );

    logger.info('Persisted evaluation record to DynamoDB', {
      repositoryFullName: record.repository_full_name,
      action: record.action,
      riskLevel: record.risk_level,
      tableName: this.tableName,
      recordKey: {
        pk: record.pk,
        sk: record.sk,
      },
    });
  }
}

export const createEvaluationRepository = (
  config: EvaluationRepositoryConfig,
): EvaluationRepository =>
  config.evaluationRepository === 'dynamodb'
    ? new DynamoDbEvaluationRepository(
        config.evaluationsTableName,
        getDocumentClient(config.awsRegion),
      )
    : new ConsoleEvaluationRepository();
