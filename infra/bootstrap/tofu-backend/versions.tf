terraform {
  required_version = ">= 1.6.0"

  backend "local" {
    path = ".bootstrap.tfstate"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.42, < 7.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
