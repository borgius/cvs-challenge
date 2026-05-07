variable "service_name" {
  description = "Base service name used when naming alarm resources."
  type        = string
}

variable "alarm_topic_name" {
  description = "Name of the SNS topic that receives alarm notifications."
  type        = string
}

variable "alarm_email_subscriptions" {
  description = "Email endpoints subscribed to the SNS alarm topic."
  type        = list(string)
  default     = []
}

variable "lambda_function_name" {
  description = "Name of the Lambda function monitored by the errors alarm."
  type        = string
}

variable "api_id" {
  description = "API Gateway HTTP API identifier used in the API 5xx alarm dimensions."
  type        = string
}

variable "stage_name" {
  description = "Stage name used in the API 5xx alarm dimensions."
  type        = string
  default     = "$default"
}

variable "lambda_errors_threshold" {
  description = "Threshold that triggers the Lambda errors alarm."
  type        = number
  default     = 1
}

variable "lambda_errors_evaluation_periods" {
  description = "Number of periods evaluated by the Lambda errors alarm."
  type        = number
  default     = 1
}

variable "lambda_errors_period_seconds" {
  description = "Metric period, in seconds, used by the Lambda errors alarm."
  type        = number
  default     = 60
}

variable "api_5xx_threshold" {
  description = "Threshold that triggers the API Gateway 5xx alarm."
  type        = number
  default     = 1
}

variable "api_5xx_evaluation_periods" {
  description = "Number of periods evaluated by the API Gateway 5xx alarm."
  type        = number
  default     = 1
}

variable "api_5xx_period_seconds" {
  description = "Metric period, in seconds, used by the API Gateway 5xx alarm."
  type        = number
  default     = 60
}

variable "tags" {
  description = "Tags applied to observability resources created by the wrapper."
  type        = map(string)
  default     = {}
}
