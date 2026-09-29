# Shelf Monitor: dashboard

React + TypeScript + Vite front end for the shelf-monitoring API. See the [root README](../README.md) for the full setup.

```bash
npm install
npm run dev      # http://localhost:3001 — proxies /api and /uploads to http://localhost:3000
npm run build    # typecheck + production bundle in dist/
npm run lint
```

Set `API_URL` to proxy to a different API in development, or `VITE_API_URL` at build time when the API is served from another origin (remember to add the dashboard origin to the API's `CORS_ORIGIN`).

## How it fits together

- **`src/api/`**: a typed `fetch` client (`api.*`) and the API's response types.
- **`src/hooks/useQuery.ts`**: loading/error state, stale-response protection, and a `liveOn` option that refetches (debounced) when matching server events arrive.
- **`src/context/LiveEventsContext.tsx`**: one `EventSource` on `/api/events`, shared by every page. The connection state shows in the sidebar.
- **`src/context/ToastContext.tsx`**: notifications. New critical/high alerts toast on any page.
- **`src/components/ui/`**: the small design system: icons, severity/status/stock badges, stat cards, modal, loading/empty/error states.
- **`src/App.css`**: design tokens for light and dark themes, plus shared primitives (`.card`, `.btn`, `.badge`, `.table`, `.field`, …). Page modules only add layout.

## Conventions

- Severity uses a single ordinal red ramp (`--sev-critical` … `--sev-low`), validated for colour-vision separation in both themes, and always paired with a text label.
- Pages keep selection in the URL (`/alerts?id=…`, `/inventory?sku=…`, `/vision-ai?shelf=…`), so links between pages deep-link to the right item.
- The operator name recorded on acknowledgements and resolutions is remembered per browser.
