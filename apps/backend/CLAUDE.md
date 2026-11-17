# Backend (NestJS 11)

Contract: `.claude/contracts.md` §5.

- Endpoints: `/api/info`, `/api/admin/stats` (Bearer `ADMIN_TOKEN`), `/api/chaos/error`, `/api/chaos/slow?ms=`,
  `/healthz`, `/readyz`. Metrics on a separate server: `:9100/metrics`.
- Env is parsed once in `src/config/env.ts` (zod) and injected as `APP_CONFIG`. Add new vars there and to `.env.example`.
- `src/common/request-context.middleware.ts` sets `X-Request-Id`, writes the request log and records metrics.
  The `route` label is the route template, never the raw URL.
- Shutdown order: `/readyz` -> 503, wait `SHUTDOWN_DELAY_MS`, close HTTP server, close metrics server.
- Tests: `src/**/*.test.ts` (unit), `test/*.e2e.test.ts` (supertest). Vitest uses SWC for decorator metadata.

Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run dev` (needs `.env`).
