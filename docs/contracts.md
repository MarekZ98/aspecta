# Contracts

Single source of truth for names, ports, labels, paths and flows.
All code in this repo must follow it. If something here is wrong, fix this file in its own commit first.

## 1. Repository and registry

| Item | Value |
|---|---|
| Git repo | `https://github.com/MarekZ98/aspecta.git` (public), branch `main` |
| Backend image | `ghcr.io/marekz98/aspecta-backend` |
| Frontend image | `ghcr.io/marekz98/aspecta-frontend` |
| Image tag | `sha-<first 7 chars of commit SHA>` |
| Image platforms | `linux/amd64`, `linux/arm64` |
| Helm chart (OCI) | `oci://ghcr.io/marekz98/charts`, chart name `webapp` |
| Local cluster | kind, name `aspecta`, 1 control-plane + 2 workers, Calico CNI |

`scripts/set-repo.sh <owner>/<repo>` rewrites all repo/registry references (for forks).

## 2. Layout

```text
apps/backend/                      NestJS API
apps/frontend/                     React SPA
charts/webapp/                     Helm chart (app, security, monitoring objects)
cluster/                           kind config, Calico and Argo CD values
gitops/                            Argo CD projects, root app, platform apps
scripts/bootstrap.sh               creates the whole local environment
scripts/versions.env               pinned bootstrap versions
scripts/set-repo.sh                rewrites repo/registry references
scripts/ci/bump-chart.sh           updates image tags + chart version (CI)
.github/workflows/ci.yaml          test, image build/push, chart release
.github/workflows/chart-lint.yaml  helm lint + kubeconform
Makefile                           up/down/status/demo targets
```

## 3. Namespaces

| Namespace | Content | Created by | Pod Security |
|---|---|---|---|
| `webapp` | frontend, backend | Argo CD (`CreateNamespace` + `managedNamespaceMetadata`) | `restricted` (enforce, audit, warn) |
| `secrets-store` | source secrets (simulates external vault) | `bootstrap.sh` | `restricted` |
| `monitoring` | kube-prometheus-stack, alert-webhook | `bootstrap.sh` (needed for `grafana-admin` secret), then Argo CD | - |
| `argocd` | Argo CD | `bootstrap.sh` (Helm) | - |
| `traefik` | Traefik ingress controller | Argo CD | - |
| `external-secrets` | External Secrets Operator | Argo CD | - |
| `kube-system` | metrics-server | Argo CD | - |
| `tigera-operator`, `calico-system` | Calico | `bootstrap.sh` (Helm) | - |

Namespace selectors in NetworkPolicies always use the label `kubernetes.io/metadata.name`.

## 4. Hostnames and ports

All hosts use `*.localtest.me` (public DNS resolves to 127.0.0.1, no hosts file edits).

| Host | Target |
|---|---|
| `aspecta.localtest.me` | webapp frontend (`/api/*` proxied by frontend nginx to backend) |
| `argocd.localtest.me` | Argo CD UI (HTTP, `server.insecure=true`) |
| `grafana.localtest.me` | Grafana |
| `prometheus.localtest.me` | Prometheus |
| `alertmanager.localtest.me` | Alertmanager |

kind maps host `127.0.0.1:80` -> NodePort `30080` (Traefik `web`) and `127.0.0.1:443` -> NodePort `30443` (Traefik `websecure`) on the control-plane node.
IngressClass name: `traefik` (default class).

## 5. Backend (`apps/backend`)

- Node.js 26 (Active LTS), NestJS 11 (Express 5 platform), TypeScript strict, CommonJS output.
- Ports: `3000` app (port name `http`), `9100` metrics (port name `metrics`, separate Node HTTP server, never exposed via Ingress).
- Global prefix `/api`, excluded for `/healthz` and `/readyz`.

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/info` | - | 200 `{ service: "backend", version, environment, greeting, hostname, uptimeSeconds, timestamp }` |
| GET | `/api/admin/stats` | `Authorization: Bearer <ADMIN_TOKEN>` | 200 `{ hostname, uptimeSeconds, requestsTotal, memoryRssBytes }`; 401 `{ message: "Unauthorized" }` otherwise (constant-time compare) |
| GET | `/api/chaos/error` | - | 500 when `CHAOS_ENABLED=true`, otherwise 404 |
| GET | `/api/chaos/slow?ms=<0-5000>` | - | waits `ms`, then 200 `{ delayedMs }`; 400 for invalid `ms`; 404 when chaos disabled |
| GET | `/healthz` | - | 200 `{ status: "ok" }` (liveness) |
| GET | `/readyz` | - | 200 `{ status: "ready" }`, 503 `{ status: "shutting-down" }` after SIGTERM |
| GET | `:9100/metrics` | - | Prometheus text format, any other path on 9100 -> 404 |

Environment (validated with zod at start; invalid env -> clear error on stderr, exit 1):

| Var | Default | Source in Kubernetes |
|---|---|---|
| `PORT` | `3000` | ConfigMap (from `backend.port`) |
| `METRICS_PORT` | `9100` | ConfigMap (from `backend.metricsPort`) |
| `APP_ENV` | `local` | ConfigMap |
| `APP_VERSION` | `dev` | image (`ARG APP_VERSION` -> `ENV`) |
| `GREETING` | `Hello from Aspecta` | ConfigMap |
| `LOG_LEVEL` | `info` (one of `debug`, `info`, `warn`, `error`) | ConfigMap |
| `CHAOS_ENABLED` | `false` (`true` or `false`) | ConfigMap |
| `SHUTDOWN_DELAY_MS` | `5000` | ConfigMap |
| `ADMIN_TOKEN` | required, min 32 chars | Secret `webapp-backend-secrets` |

Metrics (`@prometheus-io/client`, default Node metrics enabled, no prefix):

| Name | Type | Labels |
|---|---|---|
| `http_requests_total` | counter | `method`, `route`, `status` |
| `http_request_duration_seconds` | histogram, buckets `0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5` | `method`, `route`, `status` |

- `route` = matched route template including prefix (for example `/api/info`), `unmatched` for unknown routes.
- `/healthz` and `/readyz` are not recorded.

Logging: JSON lines on stdout. Fields: `timestamp`, `level`, `msg`, `requestId`; request log adds `method`, `route`, `status`, `durationMs`.
Request ID: reuse incoming `X-Request-Id` header, otherwise random UUID; always returned in the `X-Request-Id` response header.
Shutdown: on SIGTERM `/readyz` returns 503 at once, the app waits `SHUTDOWN_DELAY_MS`, then closes HTTP and metrics servers.
Container: user `1000`, runs with read-only root filesystem, only `/tmp` is writable.

## 6. Frontend (`apps/frontend`)

- React 19, Vite 7, Tailwind CSS 4, TypeScript strict. Static build served by `nginxinc/nginx-unprivileged` (stable alpine) on port `8080` (port name `http`), user `101`.
- Runtime config: the app fetches `/config.json` at start: `{ "appTitle": string, "environment": string }`. The image ships a default file; in Kubernetes it is replaced from ConfigMap.
- API calls are relative (`/api/...`, same origin). In Kubernetes the chart nginx config proxies `/api/` to `webapp-backend:3000`. The nginx config inside the image does not proxy (standalone image serves only the SPA).
- `GET /nginx-health` -> 200 `ok` (image config and chart config).
- Build arg `APP_VERSION` -> `VITE_APP_VERSION`, shown in the footer.
- Only `/tmp` is writable at runtime.

## 7. Helm chart (`charts/webapp`)

- Release name is always `webapp`, namespace `webapp`. `fullname` = release name.
- Object names:
  - Deployment, Service, HPA, PDB, ServiceAccount: `webapp-backend`, `webapp-frontend`
  - ConfigMaps: `webapp-backend-config` (env), `webapp-frontend-config` (keys `config.json`, `default.conf`)
  - ESO: ServiceAccount `webapp-eso-reader`, SecretStore `webapp-secrets-store`, ExternalSecret `webapp-backend`, generated Secret `webapp-backend-secrets`
  - Ingress: `webapp`
  - Roles + RoleBindings: `webapp-viewer`, `webapp-operator`
  - ServiceMonitor `webapp-backend`, PrometheusRule `webapp`, dashboard ConfigMap `webapp-dashboard`
  - ResourceQuota `webapp-quota`, LimitRange `webapp-limits`
  - NetworkPolicies: see §8
- Labels on every object: `helm.sh/chart`, `app.kubernetes.io/name: webapp`, `app.kubernetes.io/instance: webapp`, `app.kubernetes.io/version`, `app.kubernetes.io/managed-by`, `app.kubernetes.io/part-of: aspecta`, and `app.kubernetes.io/component: backend|frontend` where it applies.
- Pod selector labels: `app.kubernetes.io/name`, `app.kubernetes.io/instance`, `app.kubernetes.io/component`.
- When `autoscaling.enabled` is true the Deployment has no `replicas` field (HPA owns it).
- CI changes only `backend.image.tag` and `frontend.image.tag` in `values.yaml`, and `version` + `appVersion` in `Chart.yaml`.

`values.yaml` (exact schema; `values.schema.json` must match it):

```yaml
backend:
  image:
    repository: ghcr.io/marekz98/aspecta-backend
    tag: "0.1.0"
    pullPolicy: IfNotPresent
  replicaCount: 2
  port: 3000
  metricsPort: 9100
  config:
    APP_ENV: production
    GREETING: Hello from Aspecta
    LOG_LEVEL: info
    CHAOS_ENABLED: "false"
    SHUTDOWN_DELAY_MS: "5000"
  externalSecret:
    enabled: true
    refreshInterval: 1m
    remoteNamespace: secrets-store
    remoteKey: webapp-backend
  resources:
    requests: { cpu: 50m, memory: 128Mi }
    limits: { cpu: 500m, memory: 256Mi }
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilizationPercentage: 70
  pdb:
    minAvailable: 1

frontend:
  image:
    repository: ghcr.io/marekz98/aspecta-frontend
    tag: "0.1.0"
    pullPolicy: IfNotPresent
  replicaCount: 2
  port: 8080
  runtimeConfig:
    appTitle: Aspecta
    environment: production
  resources:
    requests: { cpu: 10m, memory: 32Mi }
    limits: { cpu: 200m, memory: 64Mi }
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 4
    targetCPUUtilizationPercentage: 70
  pdb:
    minAvailable: 1

ingress:
  enabled: true
  className: traefik
  host: aspecta.localtest.me
  tls:
    enabled: false
    secretName: ""

networkPolicy:
  enabled: true
  ingressControllerNamespace: traefik
  monitoringNamespace: monitoring

rbac:
  enabled: true
  viewerGroup: webapp-viewers
  operatorGroup: webapp-operators

guardrails:
  enabled: true
  quota:
    requestsCpu: "2"
    requestsMemory: 2Gi
    limitsCpu: "4"
    limitsMemory: 4Gi
    pods: "30"
  defaultLimits: { cpu: 200m, memory: 256Mi }
  defaultRequests: { cpu: 50m, memory: 64Mi }

monitoring:
  serviceMonitor:
    enabled: true
    interval: 15s
  prometheusRule:
    enabled: true
    runbookBaseUrl: https://github.com/MarekZ98/aspecta/blob/main/docs/alerts.md
  grafanaDashboard:
    enabled: true
```

`values-kind.yaml` (local kind overrides):

```yaml
backend:
  config:
    APP_ENV: kind
    CHAOS_ENABLED: "true"
frontend:
  runtimeConfig:
    environment: kind
```

## 8. NetworkPolicy matrix (namespace `webapp`)

| Policy | Selects | Allows |
|---|---|---|
| `default-deny-all` | all pods | nothing (policyTypes Ingress + Egress) |
| `allow-dns-egress` | all pods | egress UDP+TCP 53 to `kube-system` pods `k8s-app: kube-dns` |
| `frontend-ingress` | frontend | ingress TCP 8080 from namespace `traefik` |
| `frontend-egress` | frontend | egress TCP 3000 to backend pods |
| `backend-ingress` | backend | ingress TCP 3000 from frontend pods; ingress TCP 9100 from namespace `monitoring` pods `app.kubernetes.io/name: prometheus` |

The backend has no egress except DNS. Kubelet probes are not affected (Calico allows host -> local pod).
Platform namespaces have no default-deny (documented as a production follow-up).

## 9. RBAC

- Workload ServiceAccounts (`webapp-backend`, `webapp-frontend`, `webapp-eso-reader`): `automountServiceAccountToken: false`.
- Role `webapp-viewer` -> Group `webapp-viewers`: get/list/watch on `pods`, `pods/log`, `services`, `endpoints`, `configmaps`, `events`, `deployments`, `replicasets`, `horizontalpodautoscalers`, `ingresses`, `networkpolicies`, `poddisruptionbudgets`. No secrets.
- Role `webapp-operator` -> Group `webapp-operators`: all viewer rules + `patch` on `deployments` (rollout restart) and `get/update/patch` on `deployments/scale`, both limited by `resourceNames` to `webapp-backend` and `webapp-frontend`; `delete` on `pods`. No secrets, no `pods/exec`.
- Namespace `secrets-store`: Role `eso-reader` (get/list/watch `secrets`) bound to ServiceAccount `webapp/webapp-eso-reader`. Lives in `gitops/platform/secrets-store/`.
- CI has no cluster credentials. Only Argo CD changes the cluster (pull model).
- Argo CD AppProject `webapp`: source only this repo, destination only namespace `webapp`, cluster resources only `Namespace`, namespaced resources whitelist: `ConfigMap`, `Service`, `ServiceAccount`, `Deployment`, `HorizontalPodAutoscaler`, `PodDisruptionBudget`, `Ingress`, `NetworkPolicy`, `Role`, `RoleBinding`, `ResourceQuota`, `LimitRange`, `SecretStore`, `ExternalSecret`, `ServiceMonitor`, `PrometheusRule`. `Secret` is not allowed.

## 10. Secrets flow

1. `bootstrap.sh` creates (only if missing):
   - `secrets-store/webapp-backend`, key `ADMIN_TOKEN` (random, 64 hex chars)
   - `monitoring/grafana-admin`, keys `admin-user` (`admin`), `admin-password` (random)
2. External Secrets Operator, API `external-secrets.io/v1`:
   - SecretStore `webapp-secrets-store` (namespace `webapp`): provider `kubernetes`, `remoteNamespace: secrets-store`, `server.caProvider` = ConfigMap `kube-root-ca.crt` key `ca.crt`, `auth.serviceAccount.name: webapp-eso-reader`.
   - ExternalSecret `webapp-backend`: refresh `1m`, target Secret `webapp-backend-secrets` (`creationPolicy: Owner`), `ADMIN_TOKEN` <- remote key `webapp-backend` property `ADMIN_TOKEN`.
3. Backend reads `ADMIN_TOKEN` via `secretKeyRef`. Rotation: change the source secret, ESO syncs within 1 minute, then `kubectl rollout restart`.

Nothing secret is stored in git. In production only the SecretStore provider changes (Vault, AWS Secrets Manager, ...).

## 11. Monitoring

- kube-prometheus-stack selects all ServiceMonitors, PodMonitors and PrometheusRules (`*SelectorNilUsesHelmValues: false`). No release label needed.
- kind-specific: scraping of etcd, kube-controller-manager, kube-scheduler and kube-proxy is disabled (they listen on localhost in kind).
- ServiceMonitor `webapp-backend`: port `metrics`, path `/metrics`, interval `15s`.
- Grafana dashboards: ConfigMaps labelled `grafana_dashboard: "1"`, sidecar searches all namespaces.
- Alertmanager: default receiver `webhook` -> `http://alert-webhook.monitoring.svc:8080/alerts` (`send_resolved: true`); alert `Watchdog` -> receiver `null`. `group_by: [alertname, namespace]`.
- Alert webhook: `mendhak/http-https-echo` (pinned tag) in namespace `monitoring`, Service `alert-webhook:8080`; it logs every received alert (`kubectl logs`).

PrometheusRule `webapp`, group `webapp.rules`. Every alert has labels `severity`, `team: webapp` and annotations `summary`, `description`, `runbook_url` = `<runbookBaseUrl>#<alertname in lowercase>`.

| Alert | Expression | for | severity |
|---|---|---|---|
| `WebappBackendDown` | `absent(up{namespace="webapp",service="webapp-backend"} == 1)` | 1m | critical |
| `WebappHighErrorRate` | `sum(rate(http_requests_total{namespace="webapp",status=~"5.."}[5m])) / sum(rate(http_requests_total{namespace="webapp"}[5m])) > 0.05` | 2m | warning |
| `WebappHighLatencyP95` | `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{namespace="webapp"}[5m]))) > 0.5` | 5m | warning |
| `WebappPodCrashLooping` | `increase(kube_pod_container_status_restarts_total{namespace="webapp"}[15m]) > 3` | 1m | warning |
| `WebappPodNotReady` | `sum by (pod) (kube_pod_status_ready{namespace="webapp",condition="false"}) > 0` | 5m | warning |
| `WebappDeploymentReplicasMismatch` | `kube_deployment_spec_replicas{namespace="webapp"} != kube_deployment_status_replicas_available{namespace="webapp"}` | 10m | warning |
| `WebappHPAMaxedOut` | `kube_horizontalpodautoscaler_status_current_replicas{namespace="webapp"} >= kube_horizontalpodautoscaler_spec_max_replicas{namespace="webapp"}` | 15m | info |
| `WebappContainerMemoryNearLimit` | `max by (pod, container) (container_memory_working_set_bytes{namespace="webapp",container!=""}) / max by (pod, container) (kube_pod_container_resource_limits{namespace="webapp",resource="memory"}) > 0.9` | 5m | warning |

## 12. CI/CD flow

1. Push to `main` that changes `apps/backend/**` or `apps/frontend/**` (or `workflow_dispatch`) -> `.github/workflows/ci.yaml`.
2. Per changed app: `npm ci`, lint, typecheck, test, multi-arch build (`APP_VERSION=sha-xxxxxxx`), push `sha-xxxxxxx` to GHCR, Trivy scan (severity CRITICAL, ignore unfixed, fail on findings).
3. Job `release-chart` (only push / dispatch, only when at least one app job succeeded and none failed):
   `scripts/ci/bump-chart.sh --tag sha-xxxxxxx <components...>` -> `helm lint` -> `helm package` -> `helm push` to `oci://ghcr.io/marekz98/charts` -> commit `chore(release): webapp <version> [skip ci]` as `github-actions[bot]` -> `git pull --rebase` -> `git push`.
4. Argo CD polls git (reconciliation timeout 60s) and syncs `webapp` with the new tags.

- Pull requests: lint, typecheck, test and image build (no push, amd64 only).
- `workflow_dispatch` builds both apps.
- Commits made with `GITHUB_TOKEN` do not start new workflow runs, so there is no loop.
- `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.

`scripts/ci/bump-chart.sh` interface:

```text
Usage: bump-chart.sh --tag <image-tag> <component>...
  component: backend | frontend
Env: CHART_DIR (default: charts/webapp)
Effect:
  - sets .<component>.image.tag = <image-tag> in $CHART_DIR/values.yaml (yq, keeps comments)
  - bumps patch of .version in $CHART_DIR/Chart.yaml, sets .appVersion = <image-tag>
  - prints "version=<new chart version>" to stdout and to $GITHUB_OUTPUT when set
Exit 1 on unknown component, missing tag, or missing files.
```

## 13. GitOps (Argo CD)

- `bootstrap.sh` installs Calico and Argo CD with Helm, then applies `gitops/projects/*.yaml` and `gitops/root-app.yaml`. Argo CD is not self-managed (documented trade-off).
- Root app `root` (project `platform`): repo path `gitops`, `directory.recurse: true`, `directory.include: '{projects/*.yaml,apps/*.yaml}'`.
- All apps: `automated: { prune: true, selfHeal: true }`, `retry: { limit: 10, backoff: { duration: 10s, factor: 2, maxDuration: 3m } }`, `CreateNamespace=true`, finalizer `resources-finalizer.argocd.argoproj.io`.
- Argo CD config has a health check for `argoproj.io/Application`, so sync waves between child apps work.
- Chart objects that need CRDs from other apps (`SecretStore`, `ExternalSecret`, `ServiceMonitor`, `PrometheusRule`) have annotation `argocd.argoproj.io/sync-options: SkipDryRunOnMissingResource=true`.

| App (`gitops/apps/<name>.yaml`) | Wave | Project | Namespace | Source |
|---|---|---|---|---|
| `metrics-server` | -2 | platform | kube-system | Helm `https://kubernetes-sigs.github.io/metrics-server/` chart `metrics-server`, arg `--kubelet-insecure-tls` |
| `external-secrets` | -2 | platform | external-secrets | Helm `https://charts.external-secrets.io` chart `external-secrets`, `ServerSideApply=true` (CRDs are too big for client-side apply) |
| `kube-prometheus-stack` | -2 | platform | monitoring | Helm `https://prometheus-community.github.io/helm-charts` chart `kube-prometheus-stack`, `ServerSideApply=true` |
| `traefik` | -2 | platform | traefik | Helm `https://traefik.github.io/charts` chart `traefik`, Service NodePort 30080/30443, default IngressClass `traefik`, Ingress status `127.0.0.1`, `SkipDryRunOnMissingResource=true` |
| `alert-webhook` | -1 | platform | monitoring | git `gitops/platform/alert-webhook` |
| `secrets-store-rbac` | -1 | platform | secrets-store | git `gitops/platform/secrets-store` |
| `webapp` | 1 | webapp | webapp | git `charts/webapp`, `releaseName: webapp`, valueFiles `values.yaml`, `values-kind.yaml` |

Helm apps keep values inline in `spec.source.helm.valuesObject`.

## 14. Versions

- Pin every chart, image and GitHub Action. Resolve the latest stable version at implementation time (`helm search repo`, GitHub releases/tags, Docker Hub tags API). No `latest` tags, no ranges.
- GitHub Actions are pinned by full commit SHA with a `# vX.Y.Z` comment.
- Node.js 26 Active LTS (`node:26-alpine`), `nginxinc/nginx-unprivileged` stable alpine, kind >= v0.31.0.
- TypeScript `~6.0` in both apps (TypeScript 7 has no programmatic API yet; typescript-eslint and Nest tooling need it). NestJS stays on major 11.
