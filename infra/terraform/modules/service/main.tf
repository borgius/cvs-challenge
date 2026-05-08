locals {
  github_ssm_parameter_names = [
    for parameter_name in [
      var.github_webhook_secret_ssm_parameter_name,
      var.github_token_ssm_parameter_name,
      var.github_app_id_ssm_parameter_name,
      var.github_app_private_key_ssm_parameter_name,
      var.github_app_installation_id_ssm_parameter_name,
    ] : parameter_name if parameter_name != null && trimspace(parameter_name) != ""
  ]
  github_ssm_parameter_arns = [
    for parameter_name in local.github_ssm_parameter_names : format(
      "arn:%s:ssm:%s:%s:parameter%s",
      data.aws_partition.current.partition,
      data.aws_region.current.region,
      data.aws_caller_identity.current.account_id,
      startswith(parameter_name, "/") ? parameter_name : "/${parameter_name}",
    )
  ]

  environment_variables = {
    GITHUB_WEBHOOK_SECRET_SSM_PARAMETER_NAME      = var.github_webhook_secret_ssm_parameter_name
    GITHUB_TOKEN_SSM_PARAMETER_NAME               = coalesce(var.github_token_ssm_parameter_name, "")
    GITHUB_APP_ID_SSM_PARAMETER_NAME              = var.github_app_id_ssm_parameter_name
    GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER_NAME     = var.github_app_private_key_ssm_parameter_name
    GITHUB_APP_INSTALLATION_ID_SSM_PARAMETER_NAME = coalesce(var.github_app_installation_id_ssm_parameter_name, "")
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

data "aws_partition" "current" {}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

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
