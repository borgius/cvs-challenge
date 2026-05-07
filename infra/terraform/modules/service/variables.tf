variable "function_name" {
  description = "Unique name for the PR Concierge Lambda function."
  type        = string
}

variable "role_name" {
  description = "Name of the IAM role attached to the Lambda function."
  type        = string
}

variable "description" {
  description = "Description applied to the Lambda function."
  type        = string
  default     = "PR Concierge webhook processor"
}

variable "handler" {
  description = "Lambda handler entrypoint for the packaged application."
  type        = string
  default     = "dist/index.handler"
}

variable "runtime" {
  description = "Lambda runtime for the PR Concierge service."
  type        = string
  default     = "nodejs20.x"
}

variable "memory_size" {
  description = "Memory size, in MB, allocated to the Lambda function."
  type        = number
  default     = 256
}

variable "timeout" {
  description = "Execution timeout, in seconds, for the Lambda function."
  type        = number
  default     = 30
}

variable "architectures" {
  description = "Instruction set architectures exposed by the Lambda runtime."
  type        = list(string)
  default     = ["x86_64"]
}

variable "artifact_path" {
  description = "Absolute path to the prebuilt Lambda deployment package zip file."
  type        = string
}

variable "log_retention_in_days" {
  description = "Retention period, in days, for the Lambda log group."
  type        = number
  default     = 14
}

variable "github_webhook_secret" {
  description = "Webhook secret injected into the Lambda environment for signature validation."
  type        = string
  sensitive   = true
}

variable "github_token" {
  description = "GitHub token injected into the Lambda environment for changed-file lookups."
  type        = string
  sensitive   = true
}

variable "evaluations_table_name" {
  description = "Name of the DynamoDB table used for evaluation persistence."
  type        = string
}

variable "evaluations_table_arn" {
  description = "ARN of the DynamoDB table used for evaluation persistence."
  type        = string
}

variable "raw_event_bucket_name" {
  description = "Name of the optional raw-event archive bucket."
  type        = string
  default     = null
}

variable "raw_event_bucket_arn" {
  description = "ARN of the optional raw-event archive bucket."
  type        = string
  default     = null
}

variable "enable_raw_event_archive" {
  description = "Whether the Lambda should be allowed to archive raw events to S3."
  type        = bool
  default     = false
}

variable "required_labels" {
  description = "Comma-separated labels enforced by the application at runtime."
  type        = string
  default     = ""
}

variable "evaluation_repository" {
  description = "Persistence mode configured for the deployed Lambda application."
  type        = string
  default     = "dynamodb"

  validation {
    condition     = contains(["console", "dynamodb"], var.evaluation_repository)
    error_message = "evaluation_repository must be either 'console' or 'dynamodb'."
  }
}

variable "tags" {
  description = "Tags applied to Lambda resources created by the wrapper."
  type        = map(string)
  default     = {}
}
