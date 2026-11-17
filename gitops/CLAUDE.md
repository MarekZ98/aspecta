# gitops

Argo CD config. `scripts/bootstrap.sh` applies `projects/` and `root-app.yaml` once;
after that the root app syncs `projects/*.yaml` and `apps/*.yaml` from git.

## Apps (contracts §13)

| Wave | App | Namespace | Source |
|---|---|---|---|
| -2 | `metrics-server` | kube-system | Helm chart |
| -2 | `external-secrets` | external-secrets | Helm chart, `ServerSideApply=true` |
| -2 | `kube-prometheus-stack` | monitoring | Helm chart, `ServerSideApply=true` |
| -2 | `traefik` | traefik | Helm chart, Ingress status 127.0.0.1, `SkipDryRunOnMissingResource=true` |
| -1 | `alert-webhook` | monitoring | `platform/alert-webhook` |
| -1 | `secrets-store-rbac` | secrets-store | `platform/secrets-store` |
| 1 | `webapp` | webapp | `charts/webapp` (project `webapp`) |

Waves work between child apps only because `cluster/argocd-values.yaml` adds a
health check for `argoproj.io/Application`.

## Add an app

1. Add `apps/<name>.yaml` in namespace `argocd`, copy the finalizer, sync-wave
   annotation and `syncPolicy` from an existing app.
2. Helm charts: pin `targetRevision` to an exact chart version and keep values
   inline in `spec.source.helm.valuesObject`. Check each key with
   `helm show values <repo>/<chart> --version <v>`.
3. Plain manifests: put them in `platform/<name>/` and point `source.path` there.
4. Platform add-ons use project `platform`. Only the web app uses project `webapp`.
5. Update contracts §13 and the table above.
