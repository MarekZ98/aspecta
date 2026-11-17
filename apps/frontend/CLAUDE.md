# Frontend (React 19 + Vite 7)

Contract: `docs/contracts.md` §6.

- Runtime config comes from `/config.json` (`src/lib/config.ts`), never from build-time env.
  Only `VITE_APP_VERSION` is baked in at build time (footer).
- API calls are relative (`/api/...`). `npm run dev` proxies `/api` to `http://localhost:3000`.
- `nginx/default.conf` is the image config: SPA only, no `/api` proxy. The Helm chart ships its own config with the proxy.
- Styling: Tailwind 4, neutral palette only, dark mode via `.dark` on `<html>` (`src/hooks/useTheme.ts`).
- The CSP forbids inline scripts and styles. Do not add inline `<script>` or `<style>` to `index.html`.

Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
