#!/usr/bin/env bash
set -euo pipefail

IFS= read -r expected_wrapper_sha
IFS= read -r image
actual_wrapper_sha=$(sha256sum "$0" | awk '{print $1}')
if [[ "$actual_wrapper_sha" != "$expected_wrapper_sha" ]]; then
  echo "Installed deploy wrapper does not match the tested revision" >&2
  exit 1
fi
if [[ ! "$image" =~ ^ghcr\.io/renatobardi/obo:prd-([0-9a-f]{40})@sha256:[0-9a-f]{64}$ ]]; then
  echo "Invalid production image reference" >&2
  exit 1
fi
expected_sha="${BASH_REMATCH[1]}"

lxc exec obo-prd -- bash -s -- "$image" "$expected_sha" <<'INNER'
set -euo pipefail
image="$1"
expected_sha="$2"
cd /opt/app
test -z "$(git status --porcelain)"
git fetch origin main
git merge-base --is-ancestor "$expected_sha" origin/main
git checkout --detach "$expected_sha"
exec bash scripts/deploy-prd.sh "$image"
INNER
