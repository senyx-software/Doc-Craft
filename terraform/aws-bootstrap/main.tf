# Run once locally with AWS administrator credentials. This state stays local;
# preserve it privately. Application/network state uses the bucket created here.
terraform {
  required_version = ">= 1.10.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region              = "ap-southeast-2"
  allowed_account_ids = ["506192652462"]
  default_tags {
    tags = { Application = "doccraft", Environment = "staging", ManagedBy = "terraform" }
  }
}

variable "github_oidc_provider_arn" {
  type        = string
  default     = ""
  description = "Supply the existing GitHub OIDC provider ARN when this account already has one."
}

variable "github_oidc_subject" {
  type        = string
  default     = "repo:senyx-software/Doc-Craft:environment:aws-staging"
  description = "Exact GitHub environment subject; set the ID-qualified subject if immutable OIDC claims are enabled."
  validation {
    condition     = startswith(var.github_oidc_subject, "repo:senyx-software") && endswith(var.github_oidc_subject, ":environment:aws-staging") && !strcontains(var.github_oidc_subject, "*") && !strcontains(var.github_oidc_subject, "?")
    error_message = "Specify this repository's exact aws-staging environment subject."
  }
}

data "aws_instance" "staging" { instance_id = "i-098228a0d829d7eb2" }

resource "aws_s3_bucket" "state" {
  bucket        = "doccraft-staging-tfstate-506192652462-ap-southeast-2"
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Deny", Principal = "*", Action = "s3:*",
    Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"],
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.github_oidc_provider_arn == "" ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  lifecycle { prevent_destroy = true }
}

resource "aws_iam_role" "github" {
  name                 = "doccraft-staging-github"
  max_session_duration = 3600
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Action = "sts:AssumeRoleWithWebIdentity",
    Principal = { Federated = var.github_oidc_provider_arn != "" ? var.github_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn },
    Condition = { StringEquals = {
      "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub" = var.github_oidc_subject
    } }
  }] })
}

resource "aws_iam_role_policy" "github" {
  name = "staging-network-and-release"
  role = aws_iam_role.github.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.state.arn },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = "${aws_s3_bucket.state.arn}/aws-staging/terraform.tfstate" },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.state.arn}/aws-staging/terraform.tfstate.tflock" },
    { Effect = "Allow", Action = ["ec2:Describe*"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = "ap-southeast-2" } } },
    { Effect = "Allow", Action = ["ec2:StartInstances"], Resource = "arn:aws:ec2:ap-southeast-2:506192652462:instance/i-098228a0d829d7eb2" },
    { Effect = "Allow", Action = ["ec2:ModifyNetworkInterfaceAttribute"], Resource = "arn:aws:ec2:ap-southeast-2:506192652462:network-interface/${data.aws_instance.staging.network_interface_id}" },
    { Effect = "Allow", Action = ["ec2:CreateSecurityGroup", "ec2:AllocateAddress"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = "ap-southeast-2", "aws:RequestTag/Application" = "doccraft", "aws:RequestTag/Environment" = "staging" } } },
    { Effect = "Allow", Action = ["ec2:CreateTags"], Resource = "arn:aws:ec2:ap-southeast-2:506192652462:*/*", Condition = { StringEquals = { "ec2:CreateAction" = ["CreateSecurityGroup", "AllocateAddress", "AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress"] } } },
    { Effect = "Allow", Action = ["ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress", "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress", "ec2:DeleteSecurityGroup", "ec2:ReleaseAddress"], Resource = "arn:aws:ec2:ap-southeast-2:506192652462:*/*", Condition = { StringEquals = { "aws:ResourceTag/Application" = "doccraft", "aws:ResourceTag/Environment" = "staging" } } },
    { Effect = "Allow", Action = ["ec2:AssociateAddress", "ec2:DisassociateAddress"], Resource = ["arn:aws:ec2:ap-southeast-2:506192652462:elastic-ip/*", "arn:aws:ec2:ap-southeast-2:506192652462:network-interface/${data.aws_instance.staging.network_interface_id}", "arn:aws:ec2:ap-southeast-2:506192652462:instance/i-098228a0d829d7eb2"] }
  ] })
}

output "github_role_arn" { value = aws_iam_role.github.arn }
output "state_bucket" { value = aws_s3_bucket.state.id }
