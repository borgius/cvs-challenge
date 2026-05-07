output "alarm_topic_name" {
  description = "Name of the SNS topic used for alarm delivery."
  value       = module.alarm_topic.topic_name
}

output "alarm_topic_arn" {
  description = "ARN of the SNS topic used for alarm delivery."
  value       = module.alarm_topic.topic_arn
}

output "lambda_errors_alarm_id" {
  description = "Identifier of the Lambda errors alarm."
  value       = module.lambda_errors_alarm.cloudwatch_metric_alarm_id
}

output "lambda_errors_alarm_arn" {
  description = "ARN of the Lambda errors alarm."
  value       = module.lambda_errors_alarm.cloudwatch_metric_alarm_arn
}

output "api_5xx_alarm_id" {
  description = "Identifier of the API Gateway 5xx alarm."
  value       = module.api_5xx_alarm.cloudwatch_metric_alarm_id
}

output "api_5xx_alarm_arn" {
  description = "ARN of the API Gateway 5xx alarm."
  value       = module.api_5xx_alarm.cloudwatch_metric_alarm_arn
}
