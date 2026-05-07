output "lambda_function_name" {
  description = "Name of the deployed Lambda function."
  value       = module.lambda_function.lambda_function_name
}

output "lambda_function_arn" {
  description = "ARN of the deployed Lambda function."
  value       = module.lambda_function.lambda_function_arn
}

output "lambda_function_invoke_arn" {
  description = "Invoke ARN of the deployed Lambda function."
  value       = module.lambda_function.lambda_function_invoke_arn
}

output "lambda_log_group_name" {
  description = "CloudWatch log group name created for the Lambda function."
  value       = module.lambda_function.lambda_cloudwatch_log_group_name
}

output "lambda_log_group_arn" {
  description = "CloudWatch log group ARN created for the Lambda function."
  value       = module.lambda_function.lambda_cloudwatch_log_group_arn
}

output "lambda_role_name" {
  description = "Name of the IAM role created for the Lambda function."
  value       = module.lambda_function.lambda_role_name
}

output "lambda_role_arn" {
  description = "ARN of the IAM role created for the Lambda function."
  value       = module.lambda_function.lambda_role_arn
}
