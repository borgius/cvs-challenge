locals {
  subscriptions = {
    for index, endpoint in var.alarm_email_subscriptions : "email_${index}" => {
      protocol = "email"
      endpoint = endpoint
    }
  }
}

module "alarm_topic" {
  source  = "terraform-aws-modules/sns/aws"
  version = "~> 7.1.0"

  name                = var.alarm_topic_name
  subscriptions       = local.subscriptions
  create_subscription = length(local.subscriptions) > 0

  tags = var.tags
}

module "lambda_errors_alarm" {
  source  = "terraform-aws-modules/cloudwatch/aws//modules/metric-alarm"
  version = "~> 5.7.0"

  alarm_name          = "${var.service_name}-lambda-errors"
  alarm_description   = "PR Concierge Lambda errors exceeded the configured threshold."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = var.lambda_errors_evaluation_periods
  threshold           = var.lambda_errors_threshold
  period              = tostring(var.lambda_errors_period_seconds)
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  unit                = "Count"
  dimensions = {
    FunctionName = var.lambda_function_name
  }
  treat_missing_data = "notBreaching"
  alarm_actions      = [module.alarm_topic.topic_arn]
  ok_actions         = [module.alarm_topic.topic_arn]
  tags               = var.tags
}

module "api_5xx_alarm" {
  source  = "terraform-aws-modules/cloudwatch/aws//modules/metric-alarm"
  version = "~> 5.7.0"

  alarm_name          = "${var.service_name}-http-api-5xx"
  alarm_description   = "PR Concierge HTTP API returned 5xx responses above the configured threshold."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = var.api_5xx_evaluation_periods
  threshold           = var.api_5xx_threshold
  period              = tostring(var.api_5xx_period_seconds)
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  statistic           = "Sum"
  unit                = "Count"
  dimensions = {
    ApiId = var.api_id
    Stage = var.stage_name
  }
  treat_missing_data = "notBreaching"
  alarm_actions      = [module.alarm_topic.topic_arn]
  ok_actions         = [module.alarm_topic.topic_arn]
  tags               = var.tags
}
