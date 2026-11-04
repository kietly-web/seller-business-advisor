#!/usr/bin/env bash
set -euo pipefail

# NEXT_PUBLIC_* values are inlined into the client bundle (docs/design/07-infrastructure.md)
pattern='NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY|DATABASE|DSN)'

if hits=$(git grep -nE "$pattern" -- ':!scripts/check-public-env.sh'); then
  echo "Secret-looking NEXT_PUBLIC_ variable names found:"
  echo "$hits"
  exit 1
fi
echo "No secret-looking NEXT_PUBLIC_ names."
