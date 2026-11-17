#!/usr/bin/env bash
# Rewrites the GitHub repo and GHCR owner in all tracked files, for forks.
# The script rewrites its own old_* values too, so it can run again later.
set -euo pipefail

if [[ $# -ne 1 || ! $1 =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]]; then
  echo "usage: $0 <owner>/<repo>" >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

old_repo="MarekZ98/aspecta"
old_owner="marekz98"
new_repo=$1
# GHCR image and chart paths must be lowercase.
new_owner=$(printf '%s' "${new_repo%%/*}" | tr '[:upper:]' '[:lower:]')

files=$(git ls-files -z | xargs -0 grep -lIF -e "$old_repo" -e "$old_owner" -- || true)
if [[ -z $files ]]; then
  echo "no references to $old_repo or $old_owner found"
  exit 0
fi

while IFS= read -r file; do
  # -i.bak works with both GNU and BSD sed.
  sed -i.bak \
    -e "s|${old_repo//./\.}|$new_repo|g" \
    -e "s|${old_owner//./\.}|$new_owner|g" \
    "$file"
  rm -f "$file.bak"
  echo "$file"
done <<<"$files"
