variable "api_name" {
  description = "Name assigned to the API Gateway HTTP API."
  type        = string
}

variable "description" {
  description = "Description applied to the API Gateway HTTP API."
  type        = string
  default     = "PR Concierge HTTP API"
}

variable "lambda_invoke_arn" {
  description = "Invoke ARN of the Lambda function integrated with the HTTP API routes."
  type        = string
}

variable "stage_name" {
  description = "Stage name created for the HTTP API."
  type        = string
  default     = "$default"
}

variable "access_log_retention_in_days" {
  description = "Retention period, in days, for the API access log group."
  type        = number
  default     = 14
}

variable "integration_timeout_milliseconds" {
  description = "Integration timeout, in milliseconds, applied to each Lambda-backed route."
  type        = number
  default     = 29000
}

variable "tags" {
  description = "Tags applied to API Gateway resources created by the wrapper."
  type        = map(string)
  default     = {}
}
