locals {
  github_ssm_parameter_path_prefix          = trimsuffix(var.github_ssm_parameter_path_prefix, "/")
  github_webhook_secret_parameter_name      = "${local.github_ssm_parameter_path_prefix}/webhook-secret"
  github_token_parameter_name               = "${local.github_ssm_parameter_path_prefix}/token"
  github_app_id_parameter_name              = "${local.github_ssm_parameter_path_prefix}/app-id"
  github_app_private_key_parameter_name     = "${local.github_ssm_parameter_path_prefix}/app-private-key"
  github_app_installation_id_parameter_name = "${local.github_ssm_parameter_path_prefix}/app-installation-id"

  github_ssm_parameter_arns = [
    for parameter_arn in [
      try(aws_ssm_parameter.github_webhook_secret[0].arn, null),
      try(aws_ssm_parameter.github_token[0].arn, null),
      try(aws_ssm_parameter.github_app_id[0].arn, null),
      try(aws_ssm_parameter.github_app_private_key[0].arn, null),
      try(aws_ssm_parameter.github_app_installation_id[0].arn, null),
    ] : parameter_arn if parameter_arn != null
  ]

  environment_variables = {
    GITHUB_WEBHOOK_SECRET_SSM_PARAMETER_NAME      = try(aws_ssm_parameter.github_webhook_secret[0].name, "")
    GITHUB_TOKEN_SSM_PARAMETER_NAME               = try(aws_ssm_parameter.github_token[0].name, "")
    GITHUB_APP_ID_SSM_PARAMETER_NAME              = try(aws_ssm_parameter.github_app_id[0].name, "")
    GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER_NAME     = try(aws_ssm_parameter.github_app_private_key[0].name, "")
    GITHUB_APP_INSTALLATION_ID_SSM_PARAMETER_NAME = try(aws_ssm_parameter.github_app_installation_id[0].name, "")
    EVALUATIONS_TABLE_NAME                        = var.evaluations_table_name
    RAW_EVENT_BUCKET_NAME                         = var.raw_event_bucket_name != null ? var.raw_event_bucket_name : ""
    ENABLE_RAW_EVENT_ARCHIVE                      = tostring(var.enable_raw_event_archive)
    REQUIRED_LABELS                               = var.required_labels
    EVALUATION_REPOSITORY                         = var.evaluation_repository
  }

  policy_statements = merge(
    {
      dynamodb = {
        effect    = "Allow"
        actions   = ["dynamodb:DescribeTable", "dynamodb:PutItem"]
        resources = [var.evaluations_table_arn]
      }
    },
    length(local.github_ssm_parameter_arns) > 0 ? {
      ssm_github_runtime = {
        effect    = "Allow"
        actions   = ["ssm:GetParameter", "ssm:GetParameters"]
        resources = local.github_ssm_parameter_arns
      }
    } : {},
    var.enable_raw_event_archive && var.raw_event_bucket_arn != null ? {
      s3_archive = {
        effect    = "Allow"
        actions   = ["s3:PutObject"]
        resources = ["${var.raw_event_bucket_arn}/*"]
      }
    } : {},
  )
}

resource "aws_ssm_parameter" "github_webhook_secret" {
  count = var.github_webhook_secret != null ? 1 : 0

  name        = local.github_webhook_secret_parameter_name
  description = "GitHub webhook secret for PR Concierge runtime signature validation."
  type        = "SecureString"
  value       = var.github_webhook_secret
  tags        = var.tags
}

resource "aws_ssm_parameter" "github_token" {
  count = var.github_token != null ? 1 : 0

  name        = local.github_token_parameter_name
  description = "Optional GitHub token fallback for PR Concierge runtime file reads."
  type        = "SecureString"
  value       = var.github_token
  tags        = var.tags
}

resource "aws_ssm_parameter" "github_app_id" {
  count = var.github_app_id != null ? 1 : 0

  name        = local.github_app_id_parameter_name
  description = "GitHub App ID used by PR Concierge to mint installation tokens."
  type        = "SecureString"
  value       = var.github_app_id
  tags        = var.tags
}

resource "aws_ssm_parameter" "github_app_private_key" {
  count = var.github_app_private_key != null ? 1 : 0

  name        = local.github_app_private_key_parameter_name
  description = "GitHub App private key used by PR Concierge to mint installation tokens."
  type        = "SecureString"
  value       = var.github_app_private_key
  tags        = var.tags
}

resource "aws_ssm_parameter" "github_app_installation_id" {
  count = var.github_app_installation_id != null ? 1 : 0

  name        = local.github_app_installation_id_parameter_name
  description = "Optional GitHub App installation ID override for PR Concierge."
  type        = "SecureString"
  value       = var.github_app_installation_id
  tags        = var.tags
}

module "lambda_function" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "~> 8.8.0"

  function_name = var.function_name
  role_name     = var.role_name
  description   = var.description
  handler       = var.handler
  runtime       = var.runtime
  memory_size   = var.memory_size
  timeout       = var.timeout
  architectures = var.architectures

  create_package         = false
  local_existing_package = var.artifact_path

  attach_policy_statements = true
  policy_statements        = local.policy_statements

  cloudwatch_logs_retention_in_days = var.log_retention_in_days
  logging_log_format                = "JSON"
  logging_application_log_level     = "INFO"
  logging_system_log_level          = "WARN"

  environment_variables = local.environment_variables
  tags                  = var.tags
}
