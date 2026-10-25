terraform {
  required_version = ">= 1.10.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {}
}

provider "aws" {
  region              = "ap-southeast-2"
  allowed_account_ids = ["506192652462"]
  default_tags {
    tags = { Application = "doccraft", Environment = "staging", ManagedBy = "terraform" }
  }
}
