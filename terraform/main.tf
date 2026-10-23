locals {
  firewall_rules = [
    { protocol = "tcp", ports = [80, 443], source_cidrs = ["0.0.0.0/0", "::/0"] },
    { protocol = "tcp", ports = [22], source_cidrs = var.ssh_source_cidrs }
  ]
  contract = {
    name               = var.name
    architecture       = var.architecture
    region             = var.region
    vcpu               = var.vcpu
    memory_mb          = var.memory_mb
    disk_gb            = var.disk_gb
    ssh_public_keys    = var.ssh_public_keys
    firewall_rules     = local.firewall_rules
    desired_dns_names  = [var.app_domain, var.admin_domain]
    private_ports      = [3001, 3011, 3012, 3013, 3014, 3015, 3016, 3017, 3018, 3023, 5432, 6379, 11434]
    operating_system   = "Ubuntu 24.04 LTS or equivalent supported Docker host"
    static_ip_required = true
    tags               = merge(var.tags, { application = "doccraft", managed_by = "terraform" })
  }
}
resource "terraform_data" "provider_contract" {
  input = local.contract
  lifecycle {
    precondition {
      condition     = var.app_domain != var.admin_domain
      error_message = "User and admin domains must differ."
    }
  }
}
# Add an operator-approved provider module consuming local.contract here.
# It must output the actual address. Do not replace this with a guessed provider,
# local-exec SSH provisioning, or an automatic application deployment resource.
