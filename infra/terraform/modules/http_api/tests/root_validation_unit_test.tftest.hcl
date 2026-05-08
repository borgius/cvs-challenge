variables {
  api_name          = "pr-concierge-http-api"
  lambda_invoke_arn = "arn:aws:lambda:us-east-1:123456789012:function:pr-concierge"
}

provider "aws" {
  access_key                  = "validation-test-access-key"
  secret_key                  = "validation-test-secret-key"
  token                       = "validation-test-session-token"
  region                      = "us-east-1"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
}

run "reject_invalid_stage_name" {
  command = plan

  variables {
    stage_name = "bad stage"
  }

  expect_failures = [var.stage_name]
}

run "reject_invalid_lambda_invoke_arn" {
  command = plan

  variables {
    lambda_invoke_arn = "not-an-arn"
  }

  expect_failures = [var.lambda_invoke_arn]
}

run "reject_invalid_integration_timeout" {
  command = plan

  variables {
    integration_timeout_milliseconds = 10
  }

  expect_failures = [var.integration_timeout_milliseconds]
}
