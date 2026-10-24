output "provider_contract" {
  description = "Desired infrastructure interface; no VPS, IP or DNS has been provisioned."
  value       = terraform_data.provider_contract.output
}
output "implementation_status" {
  value = "BLOCKED: operator must choose a VPS provider, region, remote state and reviewed provider module."
}
