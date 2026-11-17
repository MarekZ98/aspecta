SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

CLUSTER ?= aspecta
NS ?= webapp
APP_URL ?= http://aspecta.localtest.me
CURL_IMAGE ?= curlimages/curl:8.23.0
REPO ?=

.PHONY: help up down status argocd-password grafana-password admin-token lint \
	demo-netpol demo-rbac demo-secret rotate-secret demo-alert set-repo

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-18s %s\n", $$1, $$2}'

up: ## Create the local kind environment
	scripts/bootstrap.sh

down: ## Delete the local kind cluster
	kind delete cluster --name $(CLUSTER)

status: ## Show Argo CD apps and webapp workloads
	kubectl get applications -n argocd
	kubectl get pods,hpa,externalsecret -n $(NS)

argocd-password: ## Print the Argo CD admin password
	@kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath='{.data.password}' | base64 -d; echo

grafana-password: ## Print the Grafana admin password
	@kubectl get secret grafana-admin -n monitoring -o jsonpath='{.data.admin-password}' | base64 -d; echo

admin-token: ## Print the backend ADMIN_TOKEN
	@kubectl get secret webapp-backend -n secrets-store -o jsonpath='{.data.ADMIN_TOKEN}' | base64 -d; echo

lint: ## Lint the Helm chart and check script syntax
	helm lint --strict charts/webapp -f charts/webapp/values-kind.yaml
	find scripts -name '*.sh' -print0 | xargs -0 -n 1 bash -n

demo-netpol: ## Show allowed and blocked traffic in the webapp namespace
	@echo "==> pod in default -> webapp-backend.$(NS):3000 (expect: blocked)"
	@kubectl delete pod netpol-check -n default --ignore-not-found --wait=false >/dev/null
	@kubectl run netpol-check -n default --rm -i --quiet --restart=Never --image=$(CURL_IMAGE) -- \
		curl -sS -m 3 http://webapp-backend.$(NS):3000/api/info || echo "blocked"
	@echo "==> frontend -> backend:3000 (expect: allowed)"
	@kubectl exec -n $(NS) deploy/webapp-frontend -- wget -qO- -T 3 http://webapp-backend:3000/api/info; echo
	@echo "==> frontend -> backend:9100 (expect: blocked)"
	@kubectl exec -n $(NS) deploy/webapp-frontend -- wget -qO- -T 3 http://webapp-backend:9100/metrics || echo "blocked"
	@echo "==> host -> $(APP_URL)/api/info via Traefik (expect: allowed)"
	@curl -sS -m 5 $(APP_URL)/api/info; echo

demo-rbac: ## Show what the viewer and operator groups can do
	@for who in "jane webapp-viewers" "joe webapp-operators"; do \
		set -- $$who; \
		echo "==> $$1 (group $$2) in namespace $(NS)"; \
		for check in "get pods" "get secrets" "patch deployments/webapp-backend" "delete pods" "create pods/exec"; do \
			printf '  %-34s %s\n' "$$check" "$$(kubectl auth can-i $$check -n $(NS) --as=$$1 --as-group=$$2)"; \
		done; \
	done

demo-secret: ## Show the ESO objects and test the admin endpoint
	kubectl get externalsecret,secretstore -n $(NS)
	@echo "==> GET /api/admin/stats without token (expect: 401)"
	@curl -sS -m 5 -w '\nHTTP %{http_code}\n' $(APP_URL)/api/admin/stats
	@echo "==> GET /api/admin/stats with token from $(NS)/webapp-backend-secrets (expect: 200)"
	@curl -sS -m 5 -w '\nHTTP %{http_code}\n' \
		-H "Authorization: Bearer $$(kubectl get secret webapp-backend-secrets -n $(NS) -o jsonpath='{.data.ADMIN_TOKEN}' | base64 -d)" \
		$(APP_URL)/api/admin/stats

rotate-secret: ## Set a new ADMIN_TOKEN in the source secret
	@kubectl patch secret webapp-backend -n secrets-store --type merge \
		-p "{\"stringData\":{\"ADMIN_TOKEN\":\"$$(openssl rand -hex 32)\"}}" >/dev/null
	@echo "New ADMIN_TOKEN stored in secrets-store/webapp-backend."
	@echo "Wait up to 1 min for ESO to update $(NS)/webapp-backend-secrets, then run:"
	@echo "  kubectl rollout restart -n $(NS) deploy/webapp-backend"

demo-alert: ## Send 300 failing requests to fire WebappHighErrorRate
	@echo "==> sending 300 requests to $(APP_URL)/api/chaos/error"
	@for i in $$(seq 1 300); do curl -s -o /dev/null -m 2 $(APP_URL)/api/chaos/error; done
	@echo "Done. The alert fires after about 2-3 minutes. Look at:"
	@echo "  Prometheus alerts  http://prometheus.localtest.me/alerts"
	@echo "  Alertmanager       http://alertmanager.localtest.me"
	@echo "  Webhook log        kubectl logs -n monitoring deploy/alert-webhook --tail=50"

set-repo: ## Rewrite repo and GHCR references (REPO=<owner>/<repo>)
	@test -n "$(REPO)" || { echo "usage: make set-repo REPO=<owner>/<repo>" >&2; exit 1; }
	scripts/set-repo.sh $(REPO)
