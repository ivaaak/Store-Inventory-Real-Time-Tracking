# Shelf Monitoring & Real-Time Alerting

Tracks supermarket shelf stock by reconciling **perpetual inventory** (what the book says, driven by POS sales and restocking scans) with **computer vision** (what a camera actually sees). Its main job is catching **phantom stock**: the system thinks an item is available, but the shelf is empty.

```
POS webhook ──► ┐                          ┌──► Alerts (Slack / SMS / email)
Restock scans ─►├─► Inventory service ◄──► │
Shelf photos ──►┘   + reconciliation       └──► Live dashboard (SSE)
                     engine (Postgres)
```

| Part | Stack |
|---|---|
| `backend/` | Node 20, Express, TypeScript, Prisma 5, PostgreSQL, OpenAI vision |
| `frontend/` | React 18, Vite, TypeScript, CSS modules (no UI library) |

---

## Quick start (local development)

**Prerequisites:** Node 20+, and PostgreSQL 14+ (or Docker for the bundled one).

```bash
# 1. Database
cd backend
docker compose up -d postgres

# 2. API
cp .env.example .env            # defaults point at the compose database
npm install
npm run db:setup                # apply migrations + seed demo data
npm run dev                     # http://localhost:3000

# 3. Dashboard (second terminal)
cd frontend
npm install
npm run dev                     # http://localhost:3001 (proxies /api and /uploads)
```

**No OpenAI key?** Set `VISION_PROVIDER=mock` in `backend/.env`. Audits then return plausible fake counts, so you can exercise every alert path. The dashboard labels the provider as "Mock".

The seed is idempotent: shelves and products are upserted, and demo history (two weeks of sales, audits and alerts) is created only once.

### Full stack in Docker

```bash
cd backend
docker compose up --build -d    # API + Postgres; migrations run on start
docker compose exec app npx prisma db seed   # optional demo data
```

---

## The dashboard

| Page | What it does |
|---|---|
| **Dashboard** | KPIs, alerts needing attention, shelf health, 14-day alert trend, top sellers, recent audits |
| **Alerts** | Filter active/closed alerts; acknowledge, resolve or dismiss with notes; full history |
| **Inventory** | Searchable stock table; add stock, record sales; days-of-cover and stock-out metrics |
| **Vision AI** | Upload a shelf photo, run an audit, compare system vs. visual counts per product |
| **Floor plan** | Place real shelves, cameras, entrances and tills; shelves are coloured by live alert severity |

Everything updates **live**. The API pushes domain events over Server-Sent Events (`GET /api/events`), and pages refetch only what changed. New critical or high alerts also pop a toast on any page. Light and dark themes follow the OS until you choose one.

---

## How reconciliation works

When an audit completes, each product's visual count is compared with the book (`backend/src/services/reconciliation.ts`, unit-tested):

| Condition | Alert |
|---|---|
| Confidence < 0.6 | none: an inconclusive reading never pages anyone |
| Visual = 0 and book > shelf's phantom threshold | `PHANTOM_STOCK` · CRITICAL |
| \|book − visual\| > 3 and confidence > 0.8 | `DISCREPANCY` · HIGH |
| \|book − visual\| ≥ 1 and confidence > 0.7 | `DISCREPANCY` · MEDIUM |

Other rules:

- **Low stock.** A sale that leaves stock ≤ `minThreshold` raises `LOW_STOCK` (CRITICAL at zero). Restocking above the threshold auto-resolves it.
- **One active alert per product and type.** Repeats fold into the existing alert and escalate its severity if things got worse.
- **POS oversell.** If the till sells more than the book holds, the sale is still recorded (stock floors at 0) and a `DISCREPANCY` alert says the book was understated. Manual sales are rejected instead (409).
- **Vision failures** are recorded as `FAILED` audits plus a `CAMERA_FAILURE` alert. They are never treated as an empty shelf.
- **Webhook idempotency.** POS retries of the same order line are ignored.

---

## POS webhook

`POST /api/webhooks/pos-sale` with header `x-pos-signature: <hex HMAC-SHA256 of the raw body>` using `POS_WEBHOOK_SECRET`.

```json
{
  "event_type": "order.completed",
  "data": { "order_id": "ORD-123", "line_items": [{ "sku": "MILK-001", "quantity": 2 }] }
}
```

`order.cancelled` and `order.refunded` put stock back. Unknown SKUs are reported per line in `lineErrors` (200). Unexpected server errors return 5xx so the POS retries. Without a secret, verification is skipped in development and every webhook is rejected in production.

Full endpoint reference: [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md).

---

## Configuration

See [`backend/.env.example`](backend/.env.example). The main settings:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENAI_API_KEY` / `OPENAI_VISION_MODEL` | Vision provider (default model `gpt-4o`) |
| `VISION_PROVIDER=mock` | Fake vision results for development |
| `POS_WEBHOOK_SECRET` | HMAC secret for POS webhooks (required in production) |
| `CORS_ORIGIN` | Comma-separated dashboard origins (default `http://localhost:3001`) |
| `SLACK_WEBHOOK_URL`, `TWILIO_*`, `SENDGRID_API_KEY`, … | Notification channels; each is skipped when unset |

The frontend reads `VITE_API_URL` when the API is on another origin; otherwise it uses the Vite proxy.

---

## Development

```bash
# backend
npm run dev            # watch mode
npm test               # unit tests (jest)
npm run typecheck
npm run lint
npx prisma studio      # browse data
npx prisma migrate dev --name <change>   # after editing schema.prisma

# frontend
npm run dev
npm run build          # typecheck + production bundle
npm run lint
```

### Project layout

```
backend/
  prisma/schema.prisma, migrations/, seed.ts
  src/
    app.ts, server.ts         routes, middleware, startup/shutdown
    controllers/              HTTP handlers (thin)
    services/                 inventory, alerts, reconciliation, vision, analytics, …
    lib/                      shared Prisma client, SSE event bus
    validation/schemas.ts     zod request schemas
    webhooks/                 POS webhook handler
frontend/src/
  api/                        typed API client + response types
  context/                    theme, live events (SSE), toasts
  hooks/useQuery.ts           fetch + live refresh
  components/ui/              icons, badges, modal, stat cards, states
  pages/                      Dashboard, Alerts, Inventory, VisionAI, FloorPlan
```
