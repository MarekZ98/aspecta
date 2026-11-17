#!/usr/bin/env bash
# Points the webapp chart at new image tags and bumps the chart patch version.
# Interface: docs/contracts.md section 12.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: bump-chart.sh --tag <image-tag> <component>...
  component: backend | frontend
Env: CHART_DIR (default: charts/webapp)
EOF
  exit 1
}

fail() {
  echo "bump-chart.sh: $*" >&2
  usage
}

chart_dir="${CHART_DIR:-charts/webapp}"
tag=""
components=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      [[ $# -ge 2 && -n "$2" ]] || fail "--tag needs a value"
      tag="$2"
      shift 2
      ;;
    backend | frontend)
      components+=("$1")
      shift
      ;;
    -h | --help)
      usage
      ;;
    *)
      fail "unknown component or option: $1"
      ;;
  esac
done

[[ -n "$tag" ]] || fail "missing --tag"
[[ ${#components[@]} -gt 0 ]] || fail "no component given"
[[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$ ]] || fail "invalid image tag: $tag"

values="$chart_dir/values.yaml"
chart="$chart_dir/Chart.yaml"
[[ -f "$values" ]] || fail "missing file: $values"
[[ -f "$chart" ]] || fail "missing file: $chart"

# yq -i drops blank lines and rewrites flow maps, which makes every release diff noisy.
# Compute the change with yq and apply only the changed lines as a patch.
yq_apply() {
  local expr="$1" file="$2" diff_file rc=0
  diff_file="$(mktemp)"
  diff -U0 -w -b --ignore-blank-lines "$file" <(yq "$expr" "$file") >"$diff_file" || rc=$?
  if [[ $rc -gt 1 ]]; then
    rm -f "$diff_file"
    fail "diff failed for $file"
  fi
  if [[ $rc -eq 1 ]]; then
    patch --quiet --no-backup-if-mismatch "$file" "$diff_file"
  fi
  rm -f "$diff_file"
}

for component in "${components[@]}"; do
  TAG="$tag" yq_apply ".${component}.image.tag = strenv(TAG)" "$values"
done

current="$(yq '.version' "$chart")"
[[ "$current" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || fail "chart version is not MAJOR.MINOR.PATCH: $current"
version="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((BASH_REMATCH[3] + 1))"

VERSION="$version" TAG="$tag" yq_apply '.version = strenv(VERSION) | .appVersion = strenv(TAG)' "$chart"

echo "version=$version"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "version=$version" >>"$GITHUB_OUTPUT"
fi
