# Alert runbooks

Alerts from PrometheusRule `webapp` (group `webapp.rules`, [chart template](../charts/webapp/templates/monitoring/prometheusrule.yaml)).
Each alert links here with `runbook_url`. Prometheus: http://prometheus.localtest.me, Grafana dashboard "Aspecta / webapp".

## WebappBackendDown

`absent(up{namespace="webapp",service="webapp-backend"} == 1)` for 1m, severity `critical`.

**Meaning:** Prometheus has no backend target that answers on the metrics port.

**Impact:** All `/api` calls fail or there is no data for the other backend alerts. The SPA still loads, but shows API errors.

**Triage:**
```bash
kubectl get pods,endpoints -n webapp -l app.kubernetes.io/component=backend
kubectl describe pod -n webapp -l app.kubernetes.io/component=backend | tail -n 30
kubectl get servicemonitor webapp-backend -n webapp
kubectl get networkpolicy backend-ingress -n webapp -o yaml
```
In Prometheus, check Status -> Targets for `serviceMonitor/webapp/webapp-backend`.

**Fix:** If pods are down, follow [WebappPodCrashLooping](#webapppodcrashlooping) or [WebappPodNotReady](#webapppodnotready). If pods are up but the target is down, the scrape path is blocked: check that the Service has port `metrics` (9100) and that `backend-ingress` still allows TCP 9100 from the `monitoring` namespace.

## WebappHighErrorRate

`sum(rate(http_requests_total{namespace="webapp",status=~"5.."}[5m])) / sum(rate(http_requests_total{namespace="webapp"}[5m])) > 0.05` for 2m, severity `warning`.

**Meaning:** More than 5% of backend requests return a 5xx status.

**Impact:** Users see failed API calls.

**Triage:**
```promql
sum by (route, status) (rate(http_requests_total{namespace="webapp",status=~"5.."}[5m]))
```
```bash
kubectl logs -n webapp deploy/webapp-backend --since=10m | grep '"level":"error"' | tail -n 20
kubectl rollout history -n webapp deploy/webapp-backend
```

**Fix:** If one route causes the errors, look at its logs (use `requestId` to follow one request). If `/api/chaos/error` is the route, it is a test (`make demo-alert`) and the alert resolves after 5 minutes without traffic. If a new release started the errors, revert the release commit in git; Argo CD rolls back.

## WebappHighLatencyP95

`histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{namespace="webapp"}[5m]))) > 0.5` for 5m, severity `warning`.

**Meaning:** 95th percentile backend latency is above 500 ms.

**Impact:** The app feels slow. Requests near the nginx `proxy_read_timeout` (10s) can fail.

**Triage:**
```promql
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{namespace="webapp"}[5m])))
```
```bash
kubectl top pods -n webapp -l app.kubernetes.io/component=backend
kubectl get hpa webapp-backend -n webapp
```

**Fix:** If one route is slow, look at that code path (`/api/chaos/slow` is a test route). If CPU is at the limit and the HPA is at max, raise `backend.autoscaling.maxReplicas` or `backend.resources.limits.cpu` in `values.yaml` and push.

## WebappPodCrashLooping

`increase(kube_pod_container_status_restarts_total{namespace="webapp"}[15m]) > 3` for 1m, severity `warning`.

**Meaning:** A container restarted more than 3 times in 15 minutes.

**Impact:** Less capacity; with all replicas crashing the app is down.

**Triage:**
```bash
kubectl get pods -n webapp
kubectl logs -n webapp <pod> --previous | tail -n 30
kubectl describe pod -n webapp <pod> | grep -A5 'Last State'
```

**Fix:** `OOMKilled` -> raise the memory limit (see [WebappContainerMemoryNearLimit](#webappcontainermemorynearlimit)). Exit code 1 at start -> the backend env validation failed; the log names the bad variable, fix it in the ConfigMap values or the source secret. Failed liveness probe -> check `/healthz` and the probe timeouts.

## WebappPodNotReady

`sum by (pod) (kube_pod_status_ready{namespace="webapp",condition="false"}) > 0` for 5m, severity `warning`.

**Meaning:** A pod has not been ready for 5 minutes.

**Impact:** The pod gets no traffic. With the PDB (`minAvailable: 1`) and 2+ replicas the app still works, but with less capacity.

**Triage:**
```bash
kubectl get pods -n webapp -o wide
kubectl describe pod -n webapp <pod> | tail -n 20
kubectl get externalsecret webapp-backend -n webapp
```

**Fix:** `ImagePullBackOff` -> the tag does not exist or the GHCR package is private. `CreateContainerConfigError` -> Secret `webapp-backend-secrets` is missing; check the ExternalSecret status and the `secrets-store` RBAC. Readiness probe failing -> look at the pod logs.

## WebappDeploymentReplicasMismatch

`kube_deployment_spec_replicas{namespace="webapp"} != kube_deployment_status_replicas_available{namespace="webapp"}` for 10m, severity `warning`.

**Meaning:** A Deployment has had fewer (or more) available replicas than desired for 10 minutes.

**Impact:** A rollout is stuck or pods cannot be scheduled. Capacity is lower than planned.

**Triage:**
```bash
kubectl rollout status -n webapp deploy/webapp-backend --timeout=10s
kubectl get rs,pods -n webapp
kubectl get events -n webapp --sort-by=.lastTimestamp | tail -n 20
kubectl describe resourcequota webapp-quota -n webapp
```

**Fix:** Pending pods with `exceeded quota` -> raise `guardrails.quota` or lower replicas. Pending with `Insufficient cpu/memory` -> the nodes are full. A stuck rollout with crashing new pods -> revert the release commit in git.

## WebappHPAMaxedOut

`kube_horizontalpodautoscaler_status_current_replicas{namespace="webapp"} >= kube_horizontalpodautoscaler_spec_max_replicas{namespace="webapp"}` for 15m, severity `info`.

**Meaning:** An HPA has run at its maximum replicas for 15 minutes.

**Impact:** No room to scale further. More load will raise latency.

**Triage:**
```bash
kubectl get hpa -n webapp
kubectl top pods -n webapp
```
```promql
sum by (route) (rate(http_requests_total{namespace="webapp"}[5m]))
```

**Fix:** If the load is real, raise `<component>.autoscaling.maxReplicas` (and the quota if needed) in `values.yaml`. If it is not (a loop or a bot), find the source by route and block it.

## WebappContainerMemoryNearLimit

`max by (pod, container) (container_memory_working_set_bytes{namespace="webapp",container!=""}) / max by (pod, container) (kube_pod_container_resource_limits{namespace="webapp",resource="memory"}) > 0.9` for 5m, severity `warning`.

**Meaning:** A container uses more than 90% of its memory limit.

**Impact:** The kernel will OOM-kill the container soon, which leads to restarts.

**Triage:**
```bash
kubectl top pods -n webapp --containers
kubectl describe pod -n webapp <pod> | grep -A3 Limits
```
```promql
container_memory_working_set_bytes{namespace="webapp",container!=""}
```

**Fix:** If memory grows over time (a leak), restart (`kubectl rollout restart -n webapp deploy/<name>`) and look for the cause. If the usage is stable but high, raise `<component>.resources.limits.memory` in `values.yaml` and push.
