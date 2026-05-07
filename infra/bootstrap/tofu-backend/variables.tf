variable "aws_region" {
  description = "AWS region where the OpenTofu backend bucket and lock table live."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment label applied to backend tags."
  type        = string
  default     = "dev"
}

variable "service_name" {
  description = "Base service name used in backend tags."
  type        = string
  default     = "pr-concierge"
}

variable "tofu_state_bucket" {
  description = "Name of the S3 bucket that stores OpenTofu remote state."
  type        = string

  validation {
    condition     = length(trimspace(var.tofu_state_bucket)) > 0
    error_message = "tofu_state_bucket must not be empty."
  }
}

variable "tofu_lock_table" {
  description = "Name of the DynamoDB table that stores OpenTofu state locks."
  type        = string

  validation {
    condition     = length(trimspace(var.tofu_lock_table)) > 0
    error_message = "tofu_lock_table must not be empty."
  }
}

variable "tofu_state_bucket_force_destroy" {
  description = "Whether OpenTofu may delete a non-empty backend state bucket during destroy."
  type        = bool
  default     = false
}

variable "tofu_state_bucket_versioning_enabled" {
  description = "Whether versioning is enabled on the backend state bucket."
  type        = bool
  default     = true
}

variable "tofu_lock_table_point_in_time_recovery_enabled" {
  description = "Whether point-in-time recovery is enabled for the backend DynamoDB lock table."
  type        = bool
  default     = false
}

variable "tofu_lock_table_deletion_protection_enabled" {
  description = "Whether deletion protection is enabled for the backend DynamoDB lock table."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags merged into the backend resource tags."
  type        = map(string)
  default     = {}
}
