variable "evaluations_table_name" {
  description = "Name of the DynamoDB table used to persist PR evaluations."
  type        = string
}

variable "enable_raw_event_archive" {
  description = "Whether to provision the optional raw-event archive bucket."
  type        = bool
  default     = false
}

variable "raw_event_bucket_name" {
  description = "Name of the optional raw-event archive bucket."
  type        = string
  default     = null
}

variable "dynamodb_point_in_time_recovery_enabled" {
  description = "Whether point-in-time recovery is enabled for the evaluations table."
  type        = bool
  default     = true
}

variable "dynamodb_deletion_protection_enabled" {
  description = "Whether deletion protection is enabled for the evaluations table."
  type        = bool
  default     = false
}

variable "dynamodb_server_side_encryption_enabled" {
  description = "Whether server-side encryption is enabled for the evaluations table."
  type        = bool
  default     = true
}

variable "raw_event_bucket_force_destroy" {
  description = "Whether OpenTofu may delete a non-empty raw-event archive bucket during full destroy."
  type        = bool
  default     = false
}

variable "raw_event_bucket_versioning_enabled" {
  description = "Whether versioning is enabled on the raw-event archive bucket."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to data resources created by the wrapper."
  type        = map(string)
  default     = {}
}
