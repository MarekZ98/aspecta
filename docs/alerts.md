# Alert runbooks

Rules live in [prometheusrule.yaml](../charts/webapp/templates/monitoring/prometheusrule.yaml). Dashboard: Grafana "Aspecta / webapp".

## WebappBackendDown

No backend pod answers on the metrics port for 1 minute. Usually the API is down too.

```bash
kubectl get pods,endpoints -n webapp -l app.kubernetes.io/component=backend
```

Pods down: see the two pod alerts below. Pods up but target down: something blocks port 9100, check the Service port `metrics` and NetworkPolicy `backend-ingress`.

## WebappHighErrorRate

More than 5% of requests return 5xx for 2 minutes.

```promql
sum by (route, status) (rate(http_requests_total{namespace="webapp",status=~"5.."}[5m]))
```

If the route is `/api/chaos/error`, it is `make demo-alert` and resolves on its own. If it started with a release, revert the release commit and Argo CD rolls back. Otherwise follow one failing request in the backend logs by `requestId`.

## WebappHighLatencyP95

p95 latency above 500 ms for 5 minutes.

```promql
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{namespace="webapp"}[5m])))
```

One slow route: look at that code path (`/api/chaos/slow` is a test route). CPU at the limit and HPA at max: raise `backend.autoscaling.maxReplicas` or the CPU limit in `values.yaml`.

## WebappPodCrashLooping

A container restarted more than 3 times in 15 minutes.

```bash
kubectl logs -n webapp <pod> --previous | tail -n 30
```

`OOMKilled`: raise the memory limit. Exit code 1 right after start: env validation failed, the log names the variable. Liveness probe failures: check `/healthz` and the probe timeouts.

## WebappPodNotReady

A pod has not been ready for 5 minutes. With 2 replicas and the PDB the app still works.

```bash
kubectl describe pod -n webapp <pod> | tail -n 20
```

`ImagePullBackOff`: tag missing or GHCR package private. `CreateContainerConfigError`: Secret `webapp-backend-secrets` is missing, check the ExternalSecret.

## WebappDeploymentReplicasMismatch

Available replicas differ from desired for 10 minutes: a stuck rollout or pods that cannot be scheduled.

```bash
kubectl get events -n webapp --sort-by=.lastTimestamp | tail -n 20
```

`exceeded quota`: raise `guardrails.quota`. `Insufficient cpu/memory`: nodes are full. New pods crashing: revert the release commit.

## WebappHPAMaxedOut

An HPA has been at max replicas for 15 minutes, so there is no room left to scale.

If the load is real, raise `maxReplicas` (and the quota if needed). If not, find the source by route in the dashboard.

## WebappContainerMemoryNearLimit

A container uses more than 90% of its memory limit for 5 minutes and will be OOM-killed soon.

```bash
kubectl top pods -n webapp --containers
```

Growing over time: likely a leak, restart and investigate. Stable but high: raise the memory limit in `values.yaml`.
