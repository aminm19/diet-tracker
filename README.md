# Diet Tracker

A diet/macro tracker with a configurable health score, backed by real nutrition
data (USDA FoodData Central + Open Food Facts) rather than a hand-maintained
fake food database. Single-user, no auth, deployed so it's usable from a
phone.

See `plan.md` for the full build plan and `CLAUDE.md` for locked-in project
decisions (food data sources, health score design, design language).

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill in `.env`:
- `DATABASE_URL` — Neon Postgres connection string (pooled endpoint).
- `USDA_FDC_API_KEY` — free key from https://api.data.gov/signup/.
- `PORT` — port for the local API server (defaults to 3000).
- `VITE_API_URL` — base URL the client uses to reach the API (defaults to
  `http://localhost:3000`).

## Run

```bash
pnpm dev
```

Starts the client (Vite dev server, default `http://localhost:5173`) and the
server (`http://localhost:<PORT>`) together.

Other scripts: `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`.
