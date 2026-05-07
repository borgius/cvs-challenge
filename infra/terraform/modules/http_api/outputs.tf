output "api_id" {
  description = "Identifier of the deployed HTTP API."
  value       = module.http_api.api_id
}

output "api_arn" {
  description = "ARN of the deployed HTTP API."
  value       = module.http_api.api_arn
}

output "api_endpoint" {
  description = "Base endpoint of the deployed HTTP API."
  value       = module.http_api.api_endpoint
}

output "api_execution_arn" {
  description = "Execution ARN prefix for the deployed HTTP API."
  value       = module.http_api.api_execution_arn
}

output "stage_name" {
  description = "Stage name created for the HTTP API."
  value       = var.stage_name
}

output "stage_invoke_url" {
  description = "Invoke URL for the configured stage."
  value       = module.http_api.stage_invoke_url
}

output "access_log_group_name" {
  description = "CloudWatch log group name used for API access logs."
  value       = module.http_api.stage_access_logs_cloudwatch_log_group_name
}

output "access_log_group_arn" {
  description = "CloudWatch log group ARN used for API access logs."
  value       = module.http_api.stage_access_logs_cloudwatch_log_group_arn
}
