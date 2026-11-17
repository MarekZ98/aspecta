# charts/webapp

Helm chart for backend + frontend. Names, labels and values schema come from `.claude/contracts.md` §7–§11.

## Objects

Release is always `webapp` in namespace `webapp`, so `webapp.fullname` = `webapp`.

- `backend/`, `frontend/`: Deployment, Service, HPA, PDB, ServiceAccount `webapp-<component>`, ConfigMap `webapp-<component>-config`
- `ingress.yaml`: Ingress `webapp` -> `webapp-frontend:http`
- `secrets/`: ServiceAccount `webapp-eso-reader`, SecretStore `webapp-secrets-store`, ExternalSecret `webapp-backend` (creates Secret `webapp-backend-secrets`)
- `security/`: NetworkPolicies from §8 (fixed names, no prefix), Roles + RoleBindings `webapp-viewer`, `webapp-operator`
- `guardrails.yaml`: ResourceQuota `webapp-quota`, LimitRange `webapp-limits`
- `monitoring/`: ServiceMonitor `webapp-backend`, PrometheusRule `webapp`, ConfigMap `webapp-dashboard` (from `files/grafana-dashboard.json`)

## Rules

- No `Secret` objects in the chart. The Argo CD project does not allow them.
- CRD objects (SecretStore, ExternalSecret, ServiceMonitor, PrometheusRule) need the `webapp.crdSyncOptions` annotation.
- Every new value needs a matching entry in `values.schema.json` (`additionalProperties: false` everywhere).
- Pods must pass PSA `restricted`: non-root, seccomp `RuntimeDefault`, drop all capabilities, read-only root filesystem.
- nginx `add_header` in a location drops server-level headers. Locations with their own headers include `webapp.frontend.securityHeaders`.

## Releases

CI (`scripts/ci/bump-chart.sh`) changes only `backend.image.tag` / `frontend.image.tag` in `values.yaml` and `version` + `appVersion` in `Chart.yaml`. Keep these keys where they are.

## Render and check

```bash
helm lint --strict charts/webapp -f charts/webapp/values-kind.yaml
helm template webapp charts/webapp -n webapp -f charts/webapp/values-kind.yaml
```

`.github/workflows/chart-lint.yaml` also validates the output with kubeconform (CRD schemas from the datreeio catalog).
