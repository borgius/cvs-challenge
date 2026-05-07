module "http_api" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "~> 6.1.0"

  name          = var.api_name
  description   = var.description
  protocol_type = "HTTP"

  create_domain_name            = false
  disable_execute_api_endpoint  = false

  create_stage = true
  stage_name   = var.stage_name
  deploy_stage = true

  stage_access_log_settings = {
    create_log_group            = true
    log_group_retention_in_days = var.access_log_retention_in_days
    format = jsonencode({
      requestId        = "$context.requestId"
      requestTime      = "$context.requestTime"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integration.error"
      integrationState = "$context.integration.integrationStatus"
      sourceIp         = "$context.identity.sourceIp"
      userAgent        = "$context.identity.userAgent"
      errorMessage     = "$context.error.message"
    })
  }

  routes = {
    "GET /health" = {
      integration = {
        uri                    = var.lambda_invoke_arn
        payload_format_version = "2.0"
        timeout_milliseconds   = var.integration_timeout_milliseconds
      }
    }
    "POST /webhooks/github" = {
      integration = {
        uri                    = var.lambda_invoke_arn
        payload_format_version = "2.0"
        timeout_milliseconds   = var.integration_timeout_milliseconds
      }
    }
  }

  tags = var.tags
}
