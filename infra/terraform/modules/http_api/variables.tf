variable "api_name" {
  description = "Name assigned to the API Gateway HTTP API."
  type        = string

  validation {
    condition     = length(trimspace(var.api_name)) > 0
    error_message = "api_name must not be empty."
  }
}

variable "description" {
  description = "Description applied to the API Gateway HTTP API."
  type        = string
  default     = "PR Concierge HTTP API"
}

variable "lambda_invoke_arn" {
  description = "Invoke ARN of the Lambda function integrated with the HTTP API routes."
  type        = string

  validation {
    condition     = can(regex("^arn:[A-Za-z0-9-]+:lambda:[a-z0-9-]+:\\d{12}:function:[A-Za-z0-9-_]+(?::[A-Za-z0-9-_]+)?$", var.lambda_invoke_arn))
    error_message = "lambda_invoke_arn must look like a valid Lambda function ARN."
  }
}

variable "stage_name" {
  description = "Stage name created for the HTTP API."
  type        = string
  default     = "$default"

  validation {
    condition     = can(regex("^(\\$default|[A-Za-z0-9_-]+)$", var.stage_name))
    error_message = "stage_name must be $default or a simple API Gateway stage token without spaces."
  }
}

variable "access_log_retention_in_days" {
  description = "Retention period, in days, for the API access log group."
  type        = number
  default     = 14

  validation {
    condition = contains([
      1,
      3,
      5,
      7,
      14,
      30,
      60,
      90,
      120,
      150,
      180,
      365,
      400,
      545,
      731,
      1096,
      1827,
      2192,
      2557,
      2922,
      3288,
      3653,
    ], var.access_log_retention_in_days)
    error_message = "access_log_retention_in_days must use a CloudWatch-supported retention value."
  }
}

variable "integration_timeout_milliseconds" {
  description = "Integration timeout, in milliseconds, applied to each Lambda-backed route."
  type        = number
  default     = 29000

  validation {
    condition = (
      var.integration_timeout_milliseconds >= 50 &&
      var.integration_timeout_milliseconds <= 30000
    )
    error_message = "integration_timeout_milliseconds must be between 50 and 30000."
  }
}

variable "tags" {
  description = "Tags applied to API Gateway resources created by the wrapper."
  type        = map(string)
  default     = {}
}
