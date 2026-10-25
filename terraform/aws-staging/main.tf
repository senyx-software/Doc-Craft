# The server is a data source: Terraform cannot replace or terminate it.
data "aws_instance" "staging" {
  instance_id = "i-098228a0d829d7eb2"
  lifecycle {
    postcondition {
      condition     = self.subnet_id == "subnet-05e3aab60e27a101d"
      error_message = "The staging instance's network differs from the supplied AWS instance summary."
    }
    postcondition {
      condition     = self.metadata_options[0].http_tokens == "required"
      error_message = "IMDSv2 must remain required."
    }
  }
}

data "aws_subnet" "staging" {
  id = data.aws_instance.staging.subnet_id
  lifecycle {
    postcondition {
      condition     = self.vpc_id == "vpc-04c23751903b24e3f"
      error_message = "The staging subnet is not in the supplied VPC."
    }
  }
}

resource "aws_security_group" "staging" {
  name_prefix = "doccraft-staging-"
  description = "DocCraft staging web access and temporary GitHub runner SSH"
  vpc_id      = data.aws_subnet.staging.vpc_id
  tags        = { Name = "doccraft-staging-deploy" }
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "web" {
  for_each          = toset(["80", "443"])
  security_group_id = aws_security_group.staging.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
}

variable "operator_ssh_cidrs" {
  type        = set(string)
  default     = []
  description = "Optional operator IPv4 CIDRs. Actions opens port 22 for its own /32 only during deployment."
  validation {
    condition     = alltrue([for cidr in var.operator_ssh_cidrs : can(cidrnetmask(cidr)) && try(tonumber(split("/", cidr)[1]) > 0, false)])
    error_message = "Use restricted IPv4 CIDRs for SSH."
  }
}

variable "admin_source_cidrs" {
  type        = set(string)
  description = "Operator/VPN IPv4 CIDRs allowed to reach the admin UI on port 8443."
  validation {
    condition     = length(var.admin_source_cidrs) > 0 && alltrue([for cidr in var.admin_source_cidrs : can(cidrnetmask(cidr)) && try(tonumber(split("/", cidr)[1]) > 0, false)])
    error_message = "Supply restricted IPv4 admin source networks."
  }
}

resource "aws_vpc_security_group_ingress_rule" "admin" {
  for_each          = var.admin_source_cidrs
  security_group_id = aws_security_group.staging.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 8443
  to_port           = 8443
}

resource "aws_vpc_security_group_ingress_rule" "operator_ssh" {
  for_each          = var.operator_ssh_cidrs
  security_group_id = aws_security_group.staging.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

resource "aws_vpc_security_group_egress_rule" "outbound" {
  security_group_id = aws_security_group.staging.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Add a group without removing any existing instance security groups.
resource "aws_network_interface_sg_attachment" "staging" {
  security_group_id    = aws_security_group.staging.id
  network_interface_id = data.aws_instance.staging.network_interface_id
}

resource "aws_eip" "staging" {
  domain = "vpc"
  tags   = { Name = "doccraft-staging" }
  lifecycle { prevent_destroy = true }
}

resource "aws_eip_association" "staging" {
  allocation_id        = aws_eip.staging.id
  network_interface_id = data.aws_instance.staging.network_interface_id
  allow_reassociation  = false
}

output "public_ip" { value = aws_eip.staging.public_ip }
output "security_group_id" { value = aws_security_group.staging.id }
output "instance_id" { value = data.aws_instance.staging.id }
