# OpenTofu backend bootstrap root

This root creates the S3 bucket and DynamoDB table used by the main PR Concierge OpenTofu backend.

It is intentionally separate from `infra/terraform/` because OpenTofu cannot create the backend it is actively using.

## What it provisions

- one private S3 bucket for remote state
- bucket versioning
- AES256 server-side encryption
- public access blocks and a TLS-only bucket policy
- one DynamoDB table with a string `LockID` partition key for state locking

## State handling

This bootstrap root uses a local backend and stores its state in `.bootstrap.tfstate`, which is gitignored.
The wrapper script `scripts/bootstrap-tofu-backend.sh` will also try to import an existing bucket or lock table before apply so rerunning from a fresh checkout stays practical.

## Recommended path

Use `scripts/bootstrap-tofu-backend.sh` from the repository root instead of invoking this directory directly unless you need a manual recovery flow.
