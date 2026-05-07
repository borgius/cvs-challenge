locals {
  create_archive_bucket = var.enable_raw_event_archive && var.raw_event_bucket_name != null && var.raw_event_bucket_name != ""
}

module "evaluations_table" {
  source  = "terraform-aws-modules/dynamodb-table/aws"
  version = "~> 5.5.0"

  name      = var.evaluations_table_name
  hash_key  = "pk"
  range_key = "sk"

  billing_mode = "PAY_PER_REQUEST"

  attributes = [
    {
      name = "pk"
      type = "S"
    },
    {
      name = "sk"
      type = "S"
    },
  ]

  point_in_time_recovery_enabled = var.dynamodb_point_in_time_recovery_enabled
  deletion_protection_enabled    = var.dynamodb_deletion_protection_enabled
  server_side_encryption_enabled = var.dynamodb_server_side_encryption_enabled

  tags = var.tags
}

module "raw_event_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 5.13.0"

  create_bucket = local.create_archive_bucket
  bucket        = local.create_archive_bucket ? var.raw_event_bucket_name : null
  force_destroy = var.raw_event_bucket_force_destroy

  control_object_ownership = true
  object_ownership         = "BucketOwnerEnforced"

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  attach_deny_insecure_transport_policy  = true
  attach_require_latest_tls_policy       = true
  attach_deny_unencrypted_object_uploads = true

  versioning = {
    enabled = var.raw_event_bucket_versioning_enabled
  }

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }

  tags = var.tags
}
