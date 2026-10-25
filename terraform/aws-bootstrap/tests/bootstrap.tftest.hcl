mock_provider "aws" {}
override_data {
  target = data.aws_instance.staging
  values = { network_interface_id = "eni-0123456789abcdef0" }
}

run "restricted_oidc_trust" {
  command = plan
  variables { github_oidc_provider_arn = "arn:aws:iam::506192652462:oidc-provider/token.actions.githubusercontent.com" }
  assert {
    condition     = jsondecode(aws_iam_role.github.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:senyx-software/Doc-Craft:environment:aws-staging"
    error_message = "Only this repository's staging environment may assume the deployment role."
  }
}

run "wildcard_oidc_rejected" {
  command = plan
  variables { github_oidc_subject = "repo:senyx-software/*:environment:aws-staging" }
  expect_failures = [var.github_oidc_subject]
}
