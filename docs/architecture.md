# Architecture

Names and ports in this file come from [contracts.md](contracts.md).

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

## Request flow

The frontend nginx is the only public entry. It serves the SPA and proxies `/api/` to the backend Service.
nginx sets `X-Request-Id` to its own `$request_id`; the backend reuses it in its logs and returns it in the response, so one ID links the nginx access log and the backend log line.

```mermaid
sequenceDiagram
  participant B as Browser
  participant T as Traefik
  participant N as frontend nginx
  participant A as backend
  B->>T: GET /api/info (Host aspecta.localtest.me)
  T->>N: forward to webapp-frontend:8080
  N->>A: proxy to webapp-backend:3000<br/>X-Request-Id = nginx $request_id
  A->>A: log JSON line with requestId,<br/>count http_requests_total
  A-->>N: 200 JSON, X-Request-Id
  N-->>T: 200
  T-->>B: 200, X-Request-Id
```

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

## Design decisions

**Separate metrics port.** The backend serves `/metrics` on its own Node HTTP server on port 9100. The Ingress and the nginx proxy only know port 3000, so metrics can never leak to the internet, and the NetworkPolicy can allow 9100 only from Prometheus. It also keeps the metrics endpoint out of the request metrics.

**nginx proxies `/api`.** The browser talks to one origin, so there is no CORS setup and the backend is not public at all. The frontend is the only thing behind the Ingress. The nginx config that does the proxying lives in the chart ConfigMap; the image itself only serves the SPA, so it can run standalone.

**HPA owns replicas.** When autoscaling is on, the Deployment has no `replicas` field. Otherwise every Argo CD sync would reset the replica count and fight the HPA. The cost: `kubectl scale` is not drift for Argo CD, the HPA corrects it instead.

**Chart in the app repo.** App code, chart and GitOps config are in one repository. This is simple for one app and one environment, and a reviewer sees everything in one place. The trade-off: CI writes bot commits to the same repo, and access to config and code is the same. With several environments I would move the GitOps config to a separate repo and promote by pull request.

**Argo CD is not self-managed.** `bootstrap.sh` installs Argo CD with Helm and Argo CD then manages everything else. Self-management adds a bootstrap loop (Argo CD syncing its own deployment) that brings little value for a local cluster that is rebuilt with `make up`. In production I would let Argo CD manage itself.

**Polling instead of webhook.** GitHub cannot reach a kind cluster on a laptop, so Argo CD polls git every 60 seconds. A deploy takes about one minute longer than with a webhook, which is fine here. In production a GitHub webhook to Argo CD removes the delay.
