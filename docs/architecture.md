# Architecture

## Components

```mermaid
flowchart TB
  user([Browser]) -->|":80 -> NodePort 30080"| traefik

  subgraph ns-traefik[traefik]
    traefik[Traefik]
  end

  subgraph ns-webapp[webapp - PSA restricted]
    ing[Ingress webapp]
    fe[Deployment webapp-frontend<br/>nginx :8080]
    be[Deployment webapp-backend<br/>:3000 app, :9100 metrics]
    hpa[HPAs + PDBs]
    ss[SecretStore + ExternalSecret]
    sec[Secret webapp-backend-secrets]
    sm[ServiceMonitor + PrometheusRule]
  end

  subgraph ns-store[secrets-store - PSA restricted]
    src[Secret webapp-backend]
  end

  subgraph ns-eso[external-secrets]
    eso[External Secrets Operator]
  end

  subgraph ns-mon[monitoring]
    prom[Prometheus]
    am[Alertmanager]
    graf[Grafana]
    hook[alert-webhook]
  end

  subgraph ns-kube[kube-system]
    ms[metrics-server]
    dns[CoreDNS]
  end

  subgraph ns-argo[argocd]
    argo[Argo CD]
  end

  traefik --> ing --> fe -->|/api| be
  eso --> ss
  ss -.->|reads| src
  eso -->|writes| sec --> be
  prom -->|scrape :9100| be
  prom --> am --> hook
  graf --> prom
  ms -.->|CPU| hpa
  argo -->|sync| ns-webapp
  argo -.->|polls| git[(GitHub)]
```

The frontend nginx is the only thing behind the Ingress. It serves the SPA and proxies `/api/` to the backend,
so there is no CORS and the backend is not public. nginx passes its `$request_id` as `X-Request-Id`, and the backend
logs it, so one ID links both log lines.

## NetworkPolicies

Namespace `webapp` starts with `default-deny-all` for ingress and egress. Only the edges below are allowed (label = port).

```mermaid
flowchart LR
  traefik[traefik namespace] -->|TCP 8080| fe[frontend]
  fe -->|TCP 3000| be[backend]
  prom[Prometheus pods<br/>monitoring namespace] -->|TCP 9100| be
  fe -->|UDP/TCP 53| dns[kube-dns<br/>kube-system]
  be -->|UDP/TCP 53| dns
```

The backend has no egress except DNS. Kubelet probes still work because Calico allows traffic from the node to its local pods.

## Secrets flow

```mermaid
sequenceDiagram
  participant BS as bootstrap.sh
  participant ST as secrets-store namespace
  participant ESO as External Secrets Operator
  participant W as webapp namespace
  participant BE as backend pod
  BS->>ST: create Secret webapp-backend<br/>ADMIN_TOKEN (random, only if missing)
  ESO->>W: read SecretStore webapp-secrets-store
  ESO->>ST: get secret as ServiceAccount webapp-eso-reader<br/>(Role eso-reader, read only)
  ESO->>W: create/update Secret webapp-backend-secrets
  BE->>W: env ADMIN_TOKEN from secretKeyRef
  Note over ESO,W: refresh every 1m, after rotation run<br/>kubectl rollout restart
```

ESO requests a short-lived token for `webapp-eso-reader`, so the ServiceAccount itself does not mount a token. In production only the SecretStore provider changes.

## Argo CD sync waves

```mermaid
flowchart LR
  root[root app<br/>projects + apps] --> w2
  subgraph w2[wave -2]
    ms[metrics-server]
    eso[external-secrets]
    kps[kube-prometheus-stack]
    tr[traefik]
  end
  subgraph w1[wave -1]
    hook[alert-webhook]
    rbac[secrets-store-rbac]
  end
  subgraph w3[wave 1]
    app[webapp]
  end
  w2 --> w1 --> w3
```

Argo CD has a health check for `Application`, so a wave waits until the apps of the previous wave are Healthy.
Chart objects that use CRDs from wave -2 also have `SkipDryRunOnMissingResource=true`, as a second safety net.

Traefik is in wave -2 on purpose. Argo CD reports an Ingress as Healthy only when its status has an address.
With a NodePort Service there is no load balancer address, so Traefik publishes `127.0.0.1` (the address kind maps to the host).
If Traefik came after kube-prometheus-stack, the Grafana/Prometheus Ingresses would stay Progressing and block the next waves.

## Smaller decisions

- Chart and GitOps config live in the app repo. Simple for one app and one environment, and everything is in one place. With more environments I would move GitOps config to its own repo and promote by pull request.
- Argo CD is not self-managed. `bootstrap.sh` installs it with Helm. Self-management adds a bootstrap loop that brings little for a cluster rebuilt with `make up`.
- Polling, not a webhook. GitHub cannot reach a kind cluster on a laptop, so Argo CD polls every 60 s.

## Troubleshooting

- Port 80 or 443 in use: `kind create cluster` fails. Stop the other web server or container (`docker ps`, `sudo ss -ltnp 'sport = :80'`) and run `make up` again.
- `ImagePullBackOff` in `webapp`: CI has not run yet, or the GHCR packages are private. Run the `ci` workflow, make the packages public, then `kubectl delete pod -n webapp --all`.
- App stuck in sync waves: look at the `root` app first. A wave waits until all apps of the previous wave are Healthy, so one failing platform app blocks `webapp`.
- ExternalSecret `SecretSyncedError`: check that `secrets-store-rbac` is Synced, that Role `eso-reader` and its RoleBinding exist in `secrets-store`, and that the source secret `webapp-backend` exists there.
- WSL clock drift (TLS or token errors after the laptop sleeps): `sudo hwclock -s` in WSL or `wsl --shutdown` in Windows.
