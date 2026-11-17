#!/usr/bin/env bash
# Creates the local kind environment: cluster, Calico, source secrets,
# Argo CD and the GitOps root app. Safe to run again on an existing cluster.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# shellcheck source=versions.env
source scripts/versions.env

CLUSTER=aspecta
PSA_LABELS=(
  pod-security.kubernetes.io/enforce=restricted
  pod-security.kubernetes.io/audit=restricted
  pod-security.kubernetes.io/warn=restricted
)

step() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Usage: create_secret_if_missing <namespace> <name> <kubectl create secret args...>
create_secret_if_missing() {
  local ns=$1 name=$2
  shift 2
  if kubectl get secret "$name" -n "$ns" >/dev/null 2>&1; then
    echo "secret $ns/$name exists, keeping it"
  else
    kubectl create secret generic "$name" -n "$ns" "$@" >/dev/null
    echo "secret $ns/$name created"
  fi
}

step "Checking tools"
for tool in docker kind kubectl helm openssl; do
  command -v "$tool" >/dev/null || die "$tool is not installed"
done
docker info >/dev/null 2>&1 || die "docker daemon is not reachable"
kind_version=$(kind version | awk '{print $2}')
if [[ $(printf '%s\n%s\n' "$KIND_MIN_VERSION" "$kind_version" | sort -V | head -n 1) != "$KIND_MIN_VERSION" ]]; then
  die "kind $kind_version is too old, need $KIND_MIN_VERSION or newer"
fi
echo "kind $kind_version"

step "Creating kind cluster $CLUSTER"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  echo "cluster $CLUSTER exists"
else
  kind create cluster --config cluster/kind-config.yaml
fi
kubectl config use-context "kind-$CLUSTER"

step "Installing Calico $CALICO_CHART_VERSION"
helm repo add projectcalico https://docs.tigera.io/calico/charts --force-update >/dev/null
helm repo add argo https://argoproj.github.io/argo-helm --force-update >/dev/null
# Since Calico v3.32 the CRDs (incl. operator.tigera.io) ship in a separate chart.
# Server-side apply is required because some CRDs are larger than the client-side apply limit.
helm template calico-crds projectcalico/crd.projectcalico.org.v1 --version "$CALICO_CHART_VERSION" |
  kubectl apply --server-side --force-conflicts -f - >/dev/null
helm upgrade --install calico projectcalico/tigera-operator \
  -n tigera-operator --create-namespace \
  --version "$CALICO_CHART_VERSION" \
  -f cluster/calico-values.yaml \
  --wait --timeout 5m
kubectl wait --for=condition=Ready nodes --all --timeout=300s

step "Creating namespaces secrets-store and monitoring"
for ns in secrets-store monitoring; do
  kubectl create namespace "$ns" --dry-run=client -o yaml | kubectl apply -f -
done
kubectl label --overwrite namespace secrets-store "${PSA_LABELS[@]}"

step "Creating source secrets"
create_secret_if_missing secrets-store webapp-backend \
  --from-literal=ADMIN_TOKEN="$(openssl rand -hex 32)"
create_secret_if_missing monitoring grafana-admin \
  --from-literal=admin-user=admin \
  --from-literal=admin-password="$(openssl rand -base64 24 | tr -d '=+/')"

step "Installing Argo CD $ARGOCD_CHART_VERSION"
helm upgrade --install argocd argo/argo-cd \
  -n argocd --create-namespace \
  --version "$ARGOCD_CHART_VERSION" \
  -f cluster/argocd-values.yaml \
  --wait --timeout 10m

step "Applying Argo CD projects and root app"
kubectl apply -f gitops/projects/
kubectl apply -f gitops/root-app.yaml

step "Done"
cat <<'EOF'
URLs:
  App           http://aspecta.localtest.me
  Argo CD       http://argocd.localtest.me       (user admin, password: make argocd-password)
  Grafana       http://grafana.localtest.me      (user admin, password: make grafana-password)
  Prometheus    http://prometheus.localtest.me
  Alertmanager  http://alertmanager.localtest.me

Check progress with: make status

The first full sync takes a few minutes. The webapp images must exist in
GHCR, so the CI workflow must have run at least once on main.
EOF
