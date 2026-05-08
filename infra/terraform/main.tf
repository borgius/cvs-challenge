locals {
  function_name    = coalesce(var.function_name, var.service_name)
  lambda_role_name = coalesce(var.lambda_role_name, "${var.service_name}-lambda-role")
  api_name         = coalesce(var.api_name, "${var.service_name}-http-api")
  alarm_topic_name = coalesce(var.alarm_topic_name, "${var.service_name}-alarms")
  artifact_path    = coalesce(var.artifact_path, "${path.root}/../../.artifacts/${local.function_name}.zip")

  common_tags = merge(
    {
      Environment = var.environment
      ManagedBy   = "opentofu"
      Project     = "cvs-challenge"
      Service     = var.service_name
    },
    var.tags,
  )

  health_url  = "${trimsuffix(module.http_api.stage_invoke_url, "/")}/health"
  webhook_url = "${trimsuffix(module.http_api.stage_invoke_url, "/")}/webhooks/github"
}

module "data" {
  source = "./modules/data"

  evaluations_table_name                  = var.evaluations_table_name
  enable_raw_event_archive                = var.enable_raw_event_archive
  raw_event_bucket_name                   = var.raw_event_bucket_name
  dynamodb_point_in_time_recovery_enabled = var.dynamodb_point_in_time_recovery_enabled
  dynamodb_deletion_protection_enabled    = var.dynamodb_deletion_protection_enabled
  dynamodb_server_side_encryption_enabled = var.dynamodb_server_side_encryption_enabled
  raw_event_bucket_force_destroy          = var.raw_event_bucket_force_destroy
  raw_event_bucket_versioning_enabled     = var.raw_event_bucket_versioning_enabled
  tags                                    = local.common_tags
}

module "service" {
  source = "./modules/service"

  function_name              = local.function_name
  role_name                  = local.lambda_role_name
  artifact_path              = local.artifact_path
  handler                    = var.aws_lambda_handler
  runtime                    = var.aws_lambda_runtime
  memory_size                = var.aws_lambda_memory_size
  timeout                    = var.aws_lambda_timeout
  architectures              = var.lambda_architectures
  log_retention_in_days      = var.lambda_log_retention_in_days
  github_webhook_secret      = var.github_webhook_secret
  github_token               = var.github_token
  github_app_id              = var.github_app_id
  github_app_private_key     = var.github_app_private_key
  github_app_installation_id = var.github_app_installation_id
  evaluations_table_name     = module.data.evaluations_table_name
  evaluations_table_arn      = module.data.evaluations_table_arn
  raw_event_bucket_name      = module.data.raw_event_bucket_name
  raw_event_bucket_arn       = module.data.raw_event_bucket_arn
  enable_raw_event_archive   = var.enable_raw_event_archive
  required_labels            = var.required_labels
  evaluation_repository      = var.evaluation_repository
  tags                       = local.common_tags
}

module "http_api" {
  source = "./modules/http_api"

  api_name                         = local.api_name
  lambda_invoke_arn                = module.service.lambda_function_invoke_arn
  stage_name                       = var.api_stage_name
  access_log_retention_in_days     = var.api_access_log_retention_in_days
  integration_timeout_milliseconds = var.api_integration_timeout_milliseconds
  tags                             = local.common_tags
}

resource "aws_lambda_permission" "http_api" {
  statement_id  = "AllowExecutionFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = module.service.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.http_api.api_execution_arn}/*/*"
}

module "observability" {
  source = "./modules/observability"

  service_name                     = var.service_name
  alarm_topic_name                 = local.alarm_topic_name
  alarm_email_subscriptions        = var.alarm_email_subscriptions
  lambda_function_name             = module.service.lambda_function_name
  api_id                           = module.http_api.api_id
  stage_name                       = var.api_stage_name
  lambda_errors_threshold          = var.lambda_errors_threshold
  lambda_errors_evaluation_periods = var.lambda_errors_evaluation_periods
  lambda_errors_period_seconds     = var.lambda_errors_period_seconds
  api_5xx_threshold                = var.api_5xx_threshold
  api_5xx_evaluation_periods       = var.api_5xx_evaluation_periods
  api_5xx_period_seconds           = var.api_5xx_period_seconds
  tags                             = local.common_tags
}
