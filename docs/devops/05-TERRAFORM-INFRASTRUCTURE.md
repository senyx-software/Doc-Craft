# Terraform infrastructure

No VPS provider or existing Terraform implementation was found. `terraform/` therefore implements the explicitly requested provider-neutral contract using the built-in terraform_data resource. It validates name/region/CPU/RAM/disk, public SSH keys, restricted SSH CIDRs, desired DNS names, private ports, tags and a static-IP requirement. Its output states that no VPS/IP/DNS has been provisioned. It does not contain a guessed provider, SSH provisioner, application deployment resource or credentials.

Terraform 1.16.6 was downloaded from HashiCorp and checked against its published SHA256. Formatting, backend-disabled initialization, validation and a public-fixture contract plan passed. The plan creates only the contract state object, not a server. No apply ran. `terraform-plan.yml` repeats this safe contract plan on relevant PRs/manual dispatch, without cloud credentials.

Before real provisioning, an operator must select a provider/region, add a reviewed provider-specific module consuming local.contract, and implement actual server/SSH-key/firewall/static-IP/network outputs. Add DNS only with domain authorization. Keep SSH source networks explicit; never publish DB/Redis/Ollama. Choose hardware after full-stack staging measurements.

`backend.tf.example` illustrates encrypted S3 state with a KMS key and native lock file. It is an example, not a configured state service. Select an approved backend, provision its access/locking/encryption, and use short-lived/OIDC provider/backend credentials when supported. Avoid sensitive values in variables/state/outputs. Never commit state, plans, private tfvars or credentials.

Real provider plans must use locking and run in a separately protected infrastructure environment. Review the saved plan and require authorized operator approval before apply. The application workflow never invokes Terraform and cannot recreate the VPS. The current workflow deliberately has no apply action.

Primary references: [Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3), [Terraform provider configuration](https://developer.hashicorp.com/terraform/language/providers/configuration).
