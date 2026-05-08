variables {
  tofu_state_bucket = "pr-concierge-tofu-state-dev"
  tofu_lock_table   = "pr-concierge-opentofu-lock-dev"
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

run "reject_invalid_bucket_name" {
  command = plan

  variables {
    tofu_state_bucket = "Invalid_Bucket_Name"
  }

  expect_failures = [var.tofu_state_bucket]
}

run "reject_invalid_lock_table_name" {
  command = plan

  variables {
    tofu_lock_table = "bad table"
  }

  expect_failures = [var.tofu_lock_table]
}

run "reject_invalid_environment_name" {
  command = plan

  variables {
    environment = "Dev!"
  }

  expect_failures = [var.environment]
}
