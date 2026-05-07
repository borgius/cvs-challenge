output "evaluations_table_name" {
  description = "Name of the DynamoDB table used for evaluation persistence."
  value       = module.evaluations_table.dynamodb_table_id
}

output "evaluations_table_arn" {
  description = "ARN of the DynamoDB table used for evaluation persistence."
  value       = module.evaluations_table.dynamodb_table_arn
}

output "raw_event_bucket_name" {
  description = "Name of the raw-event archive bucket when archive storage is enabled."
  value       = local.create_archive_bucket ? module.raw_event_bucket.s3_bucket_id : null
}

output "raw_event_bucket_arn" {
  description = "ARN of the raw-event archive bucket when archive storage is enabled."
  value       = local.create_archive_bucket ? module.raw_event_bucket.s3_bucket_arn : null
}
