variable "aws_region" {
  description = "AWS region where the PR Concierge stack is deployed."
  type        = string
  default     = "us-east-1"
}

variable "allowed_account_ids" {
  description = "Optional AWS account IDs allowed by the root provider as a deployment safety rail."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for account_id in var.allowed_account_ids : can(regex("^\\d{12}$", account_id))
    ])
    error_message = "allowed_account_ids must contain 12-digit AWS account IDs."
  }
}

variable "environment" {
  description = "Deployment environment label applied to tags and naming defaults."
  type        = string
  default     = "dev"
}

variable "service_name" {
  description = "Base service name used for PR Concierge resources and tags."
  type        = string
  default     = "pr-concierge"
}

variable "function_name" {
  description = "Optional override for the Lambda function name. Defaults to service_name."
  type        = string
  default     = null
}

variable "lambda_role_name" {
  description = "Optional override for the Lambda execution role name."
  type        = string
  default     = null
}

variable "api_name" {
  description = "Optional override for the HTTP API name."
  type        = string
  default     = null
}

variable "alarm_topic_name" {
  description = "Optional override for the SNS alarm topic name."
  type        = string
  default     = null
}

variable "artifact_path" {
  description = "Absolute path to the prebuilt Lambda deployment artifact zip."
  type        = string
  default     = null
}

variable "aws_lambda_runtime" {
  description = "Lambda runtime used for the PR Concierge service."
  type        = string
  default     = "nodejs20.x"
}

variable "aws_lambda_handler" {
  description = "Lambda handler entrypoint for the packaged service."
  type        = string
  default     = "dist/index.handler"
}

variable "aws_lambda_timeout" {
  description = "Execution timeout, in seconds, for the Lambda function."
  type        = number
  default     = 30
}

variable "aws_lambda_memory_size" {
  description = "Memory size, in MB, allocated to the Lambda function."
  type        = number
  default     = 256
}

variable "lambda_architectures" {
  description = "Instruction set architectures enabled for the Lambda function."
  type        = list(string)
  default     = ["x86_64"]
}

variable "lambda_log_retention_in_days" {
  description = "Retention period, in days, for the Lambda log group."
  type        = number
  default     = 14
}

variable "api_stage_name" {
  description = "Stage name used for the HTTP API deployment."
  type        = string
  default     = "$default"
}

variable "api_access_log_retention_in_days" {
  description = "Retention period, in days, for the HTTP API access log group."
  type        = number
  default     = 14
}

variable "api_integration_timeout_milliseconds" {
  description = "Integration timeout, in milliseconds, for Lambda-backed HTTP API routes."
  type        = number
  default     = 29000
}

variable "github_webhook_secret" {
  description = "GitHub webhook secret stored in encrypted SSM Parameter Store for Lambda runtime resolution."
  type        = string
  default     = null
  sensitive   = true
}

variable "github_token" {
  description = "Optional GitHub token stored in encrypted SSM Parameter Store as a changed-file lookup fallback."
  type        = string
  default     = null
  sensitive   = true
}

variable "github_app_id" {
  description = "GitHub App ID stored in encrypted SSM Parameter Store for check-run authentication."
  type        = string
  default     = null
}

variable "github_app_private_key" {
  description = "GitHub App private key stored in encrypted SSM Parameter Store for installation token minting."
  type        = string
  default     = null
  sensitive   = true
}

variable "github_app_installation_id" {
  description = "Optional GitHub App installation ID stored in encrypted SSM Parameter Store to skip repository installation lookup."
  type        = string
  default     = null
}

variable "github_ssm_parameter_path_prefix" {
  description = "Optional SSM Parameter Store path prefix used for GitHub runtime inputs. Defaults to /<service>/<environment>/github."
  type        = string
  default     = null
}

variable "evaluations_table_name" {
  description = "Name of the DynamoDB table used for PR evaluation persistence."
  type        = string
}

variable "raw_event_bucket_name" {
  description = "Name of the optional S3 bucket used for raw webhook archive storage."
  type        = string
  default     = null
}

variable "enable_raw_event_archive" {
  description = "Whether raw webhook archive storage is enabled."
  type        = bool
  default     = false
}

variable "required_labels" {
  description = "Comma-separated labels enforced by the runtime evaluation flow."
  type        = string
  default     = ""
}

variable "evaluation_repository" {
  description = "Repository mode used by the deployed Lambda application."
  type        = string
  default     = "dynamodb"

  validation {
    condition     = contains(["console", "dynamodb"], var.evaluation_repository)
    error_message = "evaluation_repository must be either 'console' or 'dynamodb'."
  }
}

variable "dynamodb_point_in_time_recovery_enabled" {
  description = "Whether point-in-time recovery is enabled for the evaluations table."
  type        = bool
  default     = true
}

variable "dynamodb_deletion_protection_enabled" {
  description = "Whether deletion protection is enabled for the evaluations table."
  type        = bool
  default     = false
}

variable "dynamodb_server_side_encryption_enabled" {
  description = "Whether server-side encryption is enabled for the evaluations table."
  type        = bool
  default     = true
}

variable "raw_event_bucket_force_destroy" {
  description = "Whether OpenTofu may delete a non-empty archive bucket during full destroy."
  type        = bool
  default     = false
}

variable "raw_event_bucket_versioning_enabled" {
  description = "Whether versioning is enabled for the raw-event archive bucket."
  type        = bool
  default     = true
}

variable "alarm_email_subscriptions" {
  description = "Email endpoints subscribed to the SNS topic used for alarm delivery."
  type        = list(string)
  default     = []
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
  description = "Additional tags merged into the common PR Concierge stack tags."
  type        = map(string)
  default     = {}
}
