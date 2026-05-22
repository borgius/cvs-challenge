variable "aws_region" {
  description = "AWS region where the OpenTofu backend bucket and lock table live."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z]{2}(?:-gov)?-[a-z]+(?:-[a-z]+)*-\\d+$", var.aws_region))
    error_message = "aws_region must look like a valid AWS region name, such as us-east-1 or us-gov-west-1."
  }
}

variable "environment" {
  description = "Deployment environment label applied to backend tags."
  type        = string
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,16}[a-z0-9])?$", var.environment))
    error_message = "environment must use lowercase letters, numbers, or hyphens and stay reasonably short."
  }
}

variable "service_name" {
  description = "Base service name used in backend tags."
  type        = string
  default     = "pr-concierge"

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$", var.service_name))
    error_message = "service_name must use lowercase letters, numbers, or hyphens."
  }
}

variable "tofu_state_bucket" {
  description = "Name of the S3 bucket that stores OpenTofu remote state."
  type        = string

  validation {
    condition     = length(trimspace(var.tofu_state_bucket)) > 0
    error_message = "tofu_state_bucket must not be empty."
  }

  validation {
    condition = (
      can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.tofu_state_bucket)) &&
      length(regexall("\\.\\.", var.tofu_state_bucket)) == 0 &&
      length(regexall("^\\d+\\.\\d+\\.\\d+\\.\\d+$", var.tofu_state_bucket)) == 0
    )
    error_message = "tofu_state_bucket must look like a valid S3 bucket name."
  }
}

variable "tofu_lock_table" {
  description = "Name of the DynamoDB table that stores OpenTofu state locks."
  type        = string

  validation {
    condition     = length(trimspace(var.tofu_lock_table)) > 0
    error_message = "tofu_lock_table must not be empty."
  }

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]{3,255}$", var.tofu_lock_table))
    error_message = "tofu_lock_table must be 3-255 characters using letters, numbers, dots, underscores, or hyphens."
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
