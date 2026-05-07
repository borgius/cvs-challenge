output "service_name" {
  description = "Base service name used across the PR Concierge stack."
  value       = var.service_name
}

output "common_tags" {
  description = "Common tags applied to PR Concierge infrastructure resources."
  value       = local.common_tags
}

output "api_id" {
  description = "Identifier of the deployed HTTP API."
  value       = module.http_api.api_id
}

output "api_endpoint" {
  description = "Invoke URL for the deployed HTTP API stage."
  value       = module.http_api.stage_invoke_url
}

output "api_execution_arn" {
  description = "Execution ARN prefix for the deployed HTTP API."
  value       = module.http_api.api_execution_arn
}

output "health_url" {
  description = "Health endpoint URL for the deployed PR Concierge service."
  value       = local.health_url
}

output "webhook_url" {
  description = "GitHub webhook endpoint URL for the deployed PR Concierge service."
  value       = local.webhook_url
}

output "lambda_function_name" {
  description = "Name of the deployed PR Concierge Lambda function."
  value       = module.service.lambda_function_name
}

output "lambda_function_arn" {
  description = "ARN of the deployed PR Concierge Lambda function."
  value       = module.service.lambda_function_arn
}

output "lambda_function_invoke_arn" {
  description = "Invoke ARN of the deployed PR Concierge Lambda function."
  value       = module.service.lambda_function_invoke_arn
}

output "lambda_role_name" {
  description = "Name of the Lambda execution role managed by OpenTofu."
  value       = module.service.lambda_role_name
}

output "lambda_role_arn" {
  description = "ARN of the Lambda execution role managed by OpenTofu."
  value       = module.service.lambda_role_arn
}

output "lambda_log_group_name" {
  description = "CloudWatch log group name for the Lambda function."
  value       = module.service.lambda_log_group_name
}

output "evaluations_table_name" {
  description = "Name of the DynamoDB table used for evaluation persistence."
  value       = module.data.evaluations_table_name
}

output "evaluations_table_arn" {
  description = "ARN of the DynamoDB table used for evaluation persistence."
  value       = module.data.evaluations_table_arn
}

output "raw_event_bucket_name" {
  description = "Name of the optional raw-event archive bucket, when enabled."
  value       = module.data.raw_event_bucket_name
}

output "raw_event_bucket_arn" {
  description = "ARN of the optional raw-event archive bucket, when enabled."
  value       = module.data.raw_event_bucket_arn
}

output "alarm_topic_name" {
  description = "Name of the SNS topic used for alarm delivery."
  value       = module.observability.alarm_topic_name
}

output "alarm_topic_arn" {
  description = "ARN of the SNS topic used for alarm delivery."
  value       = module.observability.alarm_topic_arn
}

output "deployment_summary" {
  description = "Machine-readable deployment summary consumed by scripts and operators."
  value = {
    serviceName          = var.service_name
    functionName         = module.service.lambda_function_name
    roleName             = module.service.lambda_role_name
    apiName              = local.api_name
    apiId                = module.http_api.api_id
    apiEndpoint          = module.http_api.stage_invoke_url
    healthUrl            = local.health_url
    webhookUrl           = local.webhook_url
    evaluationsTableName = module.data.evaluations_table_name
    rawEventBucketName   = module.data.raw_event_bucket_name
    alarmTopicName       = module.observability.alarm_topic_name
    lambdaLogGroupName   = module.service.lambda_log_group_name
  }
}