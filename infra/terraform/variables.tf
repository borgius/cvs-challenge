variable "aws_region" {
  description = "AWS region for PR Concierge resources."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"
}

variable "service_name" {
  description = "Base service name used for tagging and resource naming."
  type        = string
  default     = "pr-concierge"
}
