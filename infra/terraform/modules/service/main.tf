locals {
  environment_variables = {
    GITHUB_WEBHOOK_SECRET      = var.github_webhook_secret != null ? var.github_webhook_secret : ""
    GITHUB_TOKEN               = var.github_token != null ? var.github_token : ""
    GITHUB_APP_ID              = var.github_app_id != null ? var.github_app_id : ""
    GITHUB_APP_PRIVATE_KEY     = var.github_app_private_key != null ? var.github_app_private_key : ""
    GITHUB_APP_INSTALLATION_ID = var.github_app_installation_id != null ? var.github_app_installation_id : ""
    EVALUATIONS_TABLE_NAME     = var.evaluations_table_name
    RAW_EVENT_BUCKET_NAME      = var.raw_event_bucket_name != null ? var.raw_event_bucket_name : ""
    ENABLE_RAW_EVENT_ARCHIVE   = tostring(var.enable_raw_event_archive)
    REQUIRED_LABELS            = var.required_labels
    EVALUATION_REPOSITORY      = var.evaluation_repository
  }

  policy_statements = merge(
    {
      dynamodb = {
        effect    = "Allow"
        actions   = ["dynamodb:DescribeTable", "dynamodb:PutItem"]
        resources = [var.evaluations_table_arn]
      }
    },
    var.enable_raw_event_archive && var.raw_event_bucket_arn != null ? {
      s3_archive = {
        effect    = "Allow"
        actions   = ["s3:PutObject"]
        resources = ["${var.raw_event_bucket_arn}/*"]
      }
    } : {},
  )
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
