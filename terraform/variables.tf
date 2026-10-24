variable "name" {
  type        = string
  description = "Infrastructure label, never a credential."
  default     = "doccraft"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.name))
    error_message = "Use a lowercase infrastructure label."
  }
}
variable "region" {
  type        = string
  description = "Operator-selected provider region. No provider is inferred."
}
variable "vcpu" {
  type        = number
  description = "Requested CPUs; validate with full staging measurements."
  default     = 4
  validation {
    condition     = var.vcpu >= 2 && floor(var.vcpu) == var.vcpu
    error_message = "At least two whole vCPUs are required."
  }
}
variable "memory_mb" {
  type        = number
  description = "Capacity proposal, not a measured production guarantee."
  default     = 16384
  validation {
    condition     = var.memory_mb >= 4096 && floor(var.memory_mb) == var.memory_mb
    error_message = "Supply RAM in whole MiB, at least 4096."
  }
}
variable "disk_gb" {
  type        = number
  default     = 80
  description = "Include database, images, model files, retained backups and growth."
  validation {
    condition     = var.disk_gb >= 40
    error_message = "At least 40 GB is required; benchmark storage growth."
  }
}
variable "ssh_public_keys" {
  type        = list(string)
  description = "Operator SSH PUBLIC keys only. Never supply private keys."
  validation {
    condition     = length(var.ssh_public_keys) > 0 && alltrue([for key in var.ssh_public_keys : can(regex("^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+", key))])
    error_message = "At least one SSH public key is required."
  }
}
variable "ssh_source_cidrs" {
  type        = list(string)
  description = "Operator VPN/static egress CIDRs; avoid unrestricted SSH."
  validation {
    condition     = length(var.ssh_source_cidrs) > 0 && alltrue([for cidr in var.ssh_source_cidrs : can(cidrhost(cidr, 0)) && !contains(["0.0.0.0/0", "::/0"], cidr)])
    error_message = "Use explicit restricted SSH source networks."
  }
}
variable "app_domain" {
  type        = string
  description = "Existing authorized user DNS name; this contract does not modify DNS."
}
variable "admin_domain" {
  type        = string
  description = "Existing authorized admin DNS name."
}
variable "tags" {
  type        = map(string)
  default     = {}
  description = "Non-sensitive resource metadata only."
}

variable "architecture" {
  type        = string
  default     = "amd64"
  description = "Current CI publishes Linux amd64 images. ARM requires a separately verified multi-platform build."
  validation {
    condition     = var.architecture == "amd64"
    error_message = "This release pipeline currently supports Linux amd64."
  }
}
