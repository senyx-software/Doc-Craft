terraform {
  required_version = ">= 1.10.0, < 2.0.0"
  # No VPS provider is configured in this repository. The built-in
  # terraform_data resource validates the adapter contract without credentials.
}
