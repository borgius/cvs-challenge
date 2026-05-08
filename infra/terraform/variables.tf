variable "aws_region" {
  description = "AWS region where the PR Concierge stack is deployed."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z]{2}(?:-gov)?-[a-z]+(?:-[a-z]+)*-\\d+$", var.aws_region))
    error_message = "aws_region must look like a valid AWS region name, such as us-east-1 or us-gov-west-1."
  }
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

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,16}[a-z0-9])?$", var.environment))
    error_message = "environment must use lowercase letters, numbers, or hyphens and stay reasonably short."
  }
}

variable "service_name" {
  description = "Base service name used for PR Concierge resources and tags."
  type        = string
  default     = "pr-concierge"

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$", var.service_name))
    error_message = "service_name must use lowercase letters, numbers, or hyphens."
  }
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

  validation {
    condition     = var.artifact_path == null || startswith(var.artifact_path, "/")
    error_message = "artifact_path must be an absolute path when it is set."
  }
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

  validation {
    condition     = var.aws_lambda_timeout >= 1 && var.aws_lambda_timeout <= 900
    error_message = "aws_lambda_timeout must be between 1 and 900 seconds."
  }
}

variable "aws_lambda_memory_size" {
  description = "Memory size, in MB, allocated to the Lambda function."
  type        = number
  default     = 256

  validation {
    condition     = var.aws_lambda_memory_size >= 128 && var.aws_lambda_memory_size <= 10240
    error_message = "aws_lambda_memory_size must be between 128 and 10240 MB."
  }
}

variable "lambda_architectures" {
  description = "Instruction set architectures enabled for the Lambda function."
  type        = list(string)
  default     = ["x86_64"]

  validation {
    condition = length(var.lambda_architectures) > 0 && alltrue([
      for architecture in var.lambda_architectures : contains(["x86_64", "arm64"], architecture)
    ])
    error_message = "lambda_architectures must contain only x86_64 and/or arm64 values."
  }
}

variable "lambda_log_retention_in_days" {
  description = "Retention period, in days, for the Lambda log group."
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
    ], var.lambda_log_retention_in_days)
    error_message = "lambda_log_retention_in_days must use a CloudWatch-supported retention value."
  }
}

variable "api_stage_name" {
  description = "Stage name used for the HTTP API deployment."
  type        = string
  default     = "$default"

  validation {
    condition     = length(trimspace(var.api_stage_name)) > 0
    error_message = "api_stage_name must not be empty."
  }
}

variable "api_access_log_retention_in_days" {
  description = "Retention period, in days, for the HTTP API access log group."
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
    ], var.api_access_log_retention_in_days)
    error_message = "api_access_log_retention_in_days must use a CloudWatch-supported retention value."
  }
}

variable "api_integration_timeout_milliseconds" {
  description = "Integration timeout, in milliseconds, for Lambda-backed HTTP API routes."
  type        = number
  default     = 29000

  validation {
    condition = (
      var.api_integration_timeout_milliseconds >= 50 &&
      var.api_integration_timeout_milliseconds <= 30000
    )
    error_message = "api_integration_timeout_milliseconds must be between 50 and 30000."
  }
}

variable "github_webhook_secret" {
  description = "Deprecated compatibility input. Deployment scripts read this from .env or TF_VAR_... and write SSM directly; Terraform no longer stores this value in state."
  type        = string
  default     = null
  sensitive   = true
}

variable "github_token" {
  description = "Deprecated compatibility input. Deployment scripts read this optional fallback from .env or TF_VAR_... and write SSM directly; Terraform no longer stores this value in state."
  type        = string
  default     = null
  sensitive   = true
}

variable "github_app_id" {
  description = "Deprecated compatibility input. Deployment scripts read this from .env or TF_VAR_... and write SSM directly; Terraform no longer stores this value in state."
  type        = string
  default     = null
}

variable "github_app_private_key" {
  description = "Deprecated compatibility input. Deployment scripts read this from .env or TF_VAR_... and write SSM directly; Terraform no longer stores this value in state."
  type        = string
  default     = null
  sensitive   = true
}

variable "github_app_installation_id" {
  description = "Deprecated compatibility input. Deployment scripts read this optional installation ID from .env or TF_VAR_... and write SSM directly; Terraform no longer stores this value in state."
  type        = string
  default     = null
}

variable "github_ssm_parameter_path_prefix" {
  description = "Optional SSM Parameter Store path prefix used for GitHub runtime inputs. Defaults to /<service>/<environment>/github."
  type        = string
  default     = null

  validation {
    condition = var.github_ssm_parameter_path_prefix == null || can(regex(
      "^/[A-Za-z0-9_.-/]*[A-Za-z0-9_.-]$",
      var.github_ssm_parameter_path_prefix,
    ))
    error_message = "github_ssm_parameter_path_prefix must start with '/' and must not end with '/'."
  }
}

variable "github_webhook_secret_ssm_parameter_name" {
  description = "SSM Parameter Store name containing the GitHub webhook secret. Defaults under github_ssm_parameter_path_prefix."
  type        = string
  default     = null

  validation {
    condition = var.github_webhook_secret_ssm_parameter_name == null || can(regex(
      "^/[A-Za-z0-9_.-/]*[A-Za-z0-9_.-]$",
      var.github_webhook_secret_ssm_parameter_name,
    ))
    error_message = "github_webhook_secret_ssm_parameter_name must start with '/' and must not end with '/'."
  }
}

variable "github_token_ssm_parameter_name" {
  description = "Optional SSM Parameter Store name containing the GitHub token fallback for changed-file lookups."
  type        = string
  default     = null

  validation {
    condition = var.github_token_ssm_parameter_name == null || can(regex(
      "^/[A-Za-z0-9_.-/]*[A-Za-z0-9_.-]$",
      var.github_token_ssm_parameter_name,
    ))
    error_message = "github_token_ssm_parameter_name must start with '/' and must not end with '/'."
  }
}

variable "github_app_id_ssm_parameter_name" {
  description = "SSM Parameter Store name containing the GitHub App ID. Defaults under github_ssm_parameter_path_prefix."
  type        = string
  default     = null

  validation {
    condition = var.github_app_id_ssm_parameter_name == null || can(regex(
      "^/[A-Za-z0-9_.-/]*[A-Za-z0-9_.-]$",
      var.github_app_id_ssm_parameter_name,
    ))
    error_message = "github_app_id_ssm_parameter_name must start with '/' and must not end with '/'."
  }
}

variable "github_app_private_key_ssm_parameter_name" {
  description = "SSM Parameter Store name containing the GitHub App private key. Defaults under github_ssm_parameter_path_prefix."
  type        = string
  default     = null

  validation {
    condition = var.github_app_private_key_ssm_parameter_name == null || can(regex(
      "^/[A-Za-z0-9_.-/]*[A-Za-z0-9_.-]$",
      var.github_app_private_key_ssm_parameter_name,
    ))
    error_message = "github_app_private_key_ssm_parameter_name must start with '/' and must not end with '/'."
  }
}

variable "github_app_installation_id_ssm_parameter_name" {
  description = "Optional SSM Parameter Store name containing the GitHub App installation ID override."
  type        = string
  default     = null

  validation {
    condition = var.github_app_installation_id_ssm_parameter_name == null || can(regex(
      "^/[A-Za-z0-9_.-/]*[A-Za-z0-9_.-]$",
      var.github_app_installation_id_ssm_parameter_name,
    ))
    error_message = "github_app_installation_id_ssm_parameter_name must start with '/' and must not end with '/'."
  }
}

variable "evaluations_table_name" {
  description = "Name of the DynamoDB table used for PR evaluation persistence."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]{3,255}$", var.evaluations_table_name))
    error_message = "evaluations_table_name must be 3-255 characters using letters, numbers, dots, underscores, or hyphens."
  }
}

variable "raw_event_bucket_name" {
  description = "Name of the optional S3 bucket used for raw webhook archive storage."
  type        = string
  default     = null

  validation {
    condition = var.raw_event_bucket_name == null || (
      can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.raw_event_bucket_name)) &&
      length(regexall("\\.\\.", var.raw_event_bucket_name)) == 0 &&
      length(regexall("^\\d+\\.\\d+\\.\\d+\\.\\d+$", var.raw_event_bucket_name)) == 0
    )
    error_message = "raw_event_bucket_name must look like a valid S3 bucket name when it is set."
  }
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

  validation {
    condition = alltrue([
      for email in var.alarm_email_subscriptions : can(regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", email))
    ])
    error_message = "alarm_email_subscriptions must contain valid email addresses."
  }
}

variable "lambda_errors_threshold" {
  description = "Threshold that triggers the Lambda errors alarm."
  type        = number
  default     = 1

  validation {
    condition     = var.lambda_errors_threshold > 0
    error_message = "lambda_errors_threshold must be greater than 0."
  }
}

variable "lambda_errors_evaluation_periods" {
  description = "Number of periods evaluated by the Lambda errors alarm."
  type        = number
  default     = 1

  validation {
    condition     = var.lambda_errors_evaluation_periods > 0
    error_message = "lambda_errors_evaluation_periods must be greater than 0."
  }
}

variable "lambda_errors_period_seconds" {
  description = "Metric period, in seconds, used by the Lambda errors alarm."
  type        = number
  default     = 60

  validation {
    condition     = var.lambda_errors_period_seconds > 0
    error_message = "lambda_errors_period_seconds must be greater than 0."
  }
}

variable "api_5xx_threshold" {
  description = "Threshold that triggers the API Gateway 5xx alarm."
  type        = number
  default     = 1

  validation {
    condition     = var.api_5xx_threshold > 0
    error_message = "api_5xx_threshold must be greater than 0."
  }
}

variable "api_5xx_evaluation_periods" {
  description = "Number of periods evaluated by the API Gateway 5xx alarm."
  type        = number
  default     = 1

  validation {
    condition     = var.api_5xx_evaluation_periods > 0
    error_message = "api_5xx_evaluation_periods must be greater than 0."
  }
}

variable "api_5xx_period_seconds" {
  description = "Metric period, in seconds, used by the API Gateway 5xx alarm."
  type        = number
  default     = 60

  validation {
    condition     = var.api_5xx_period_seconds > 0
    error_message = "api_5xx_period_seconds must be greater than 0."
  }
}

variable "tags" {
  description = "Additional tags merged into the common PR Concierge stack tags."
  type        = map(string)
  default     = {}
}
