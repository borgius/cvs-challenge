locals {
  common_tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "cvs-challenge"
    Service     = var.service_name
  }
}

output "service_name" {
  description = "Base service name for downstream Terraform modules."
  value       = var.service_name
}

output "common_tags" {
  description = "Shared starter tags for PR Concierge infrastructure."
  value       = local.common_tags
}
