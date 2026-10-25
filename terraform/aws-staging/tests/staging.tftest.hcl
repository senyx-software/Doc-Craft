# Mocked plans validate contracts and safety guards without contacting AWS.
mock_provider "aws" {}

variables { admin_source_cidrs = ["192.0.2.10/32"] }

override_data {
  target = data.aws_instance.staging
  values = {
    subnet_id            = "subnet-05e3aab60e27a101d"
    network_interface_id = "eni-0123456789abcdef0"
    metadata_options     = [{ http_tokens = "required" }]
  }
}
override_data {
  target = data.aws_subnet.staging
  values = { vpc_id = "vpc-04c23751903b24e3f" }
}

run "existing_instance_plan" {
  command = plan
  assert {
    condition     = aws_network_interface_sg_attachment.staging.network_interface_id == "eni-0123456789abcdef0" && aws_eip_association.staging.network_interface_id == "eni-0123456789abcdef0"
    error_message = "Both network additions must target the existing instance's primary ENI."
  }
}

run "public_ssh_rejected" {
  command = plan
  variables { operator_ssh_cidrs = ["0.0.0.0/0"] }
  expect_failures = [var.operator_ssh_cidrs]
}

run "public_admin_access_rejected" {
  command = plan
  variables { admin_source_cidrs = ["192.0.2.10/0"] }
  expect_failures = [var.admin_source_cidrs]
}

run "wrong_instance_network_rejected" {
  command = plan
  override_data {
    target = data.aws_instance.staging
    values = {
      subnet_id            = "subnet-00000000000000000"
      network_interface_id = "eni-0123456789abcdef0"
      metadata_options     = [{ http_tokens = "required" }]
    }
  }
  expect_failures = [data.aws_instance.staging]
}

run "imds_v1_rejected" {
  command = plan
  override_data {
    target = data.aws_instance.staging
    values = {
      subnet_id            = "subnet-05e3aab60e27a101d"
      network_interface_id = "eni-0123456789abcdef0"
      metadata_options     = [{ http_tokens = "optional" }]
    }
  }
  expect_failures = [data.aws_instance.staging]
}
