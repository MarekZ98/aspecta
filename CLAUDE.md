# Aspecta – Kubernetes production environment (assignment)

Cloud native environment for a simple web app (NestJS backend + React frontend) on Kubernetes:
Helm chart, RBAC, NetworkPolicies, GitOps with Argo CD, CI/CD with GitHub Actions,
monitoring with kube-prometheus-stack. Local target cluster is kind with Calico.

## Source of truth
- `docs/contracts.md` – names, ports, labels, values schema, flows. Always follow it.
  If it is wrong, fix it in a separate commit first.

## Layout
- `apps/backend` – NestJS 11 API (see its CLAUDE.md)
- `apps/frontend` – React 19 + Vite SPA (see its CLAUDE.md)
- `charts/webapp` – Helm chart for both apps (see its CLAUDE.md)
- `cluster/` – kind, Calico and Argo CD bootstrap values
- `gitops/` – Argo CD projects, root app and platform apps (see its CLAUDE.md)
- `scripts/` – bootstrap and CI helper scripts
- `.github/workflows/` – CI (`ci.yaml`) and chart lint (`chart-lint.yaml`)

## Rules
- English for code, comments, docs and commits. Simple English (B2).
- Strict TypeScript, no `any`. ESLint flat config. Path alias `@/` -> `src/`.
- No secrets in git. Secrets come from External Secrets (see contracts §10).
- Pin every version (charts, images, GitHub Actions by commit SHA). No `latest`.
- Commit directly to `main`. Agents never push (`.githooks/pre-push` blocks it).
- Conventional commits: `feat(scope): ...`, `fix(scope): ...`, `ci: ...`, `docs: ...`.

## Commands
- `make up` / `make down` – create / delete the local kind environment
- `make lint` – helm lint + script syntax checks
- Backend / frontend: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
