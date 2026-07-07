# Diet Tracker — Build Plan

## Decisions locked in (from planning conversation)
- **Stack**: Vite+React19+TS client, Hono server, Neon Postgres via Drizzle, Zod shared schemas, Vitest, pnpm. Per `~/Documents/fullStack/CLAUDE.md`.
- **Scope**: single implicit user, no auth, but deployed (Vercel client / Render server) so it's usable from phone.
- **Food data**: USDA FoodData Central (whole/generic/homemade foods, lab-verified) + Open Food Facts (branded/packaged, barcode-ready, NOVA processing group). Both free. Search results cached into our own `foods` table; log entries snapshot nutrition at log time so upstream corrections never rewrite history.
- **Health score**: weighted 0–100 composite, four togglable factors: whole-food/processed (NOVA), macro fit vs. goals, sugar/sodium levels, food-group variety. User can toggle each factor independently or turn the whole score off. Master settings live in `health_score_settings`.
- **Day-one feature scope**: search + log + edit + delete + daily view + goals + health score. Barcode scanning deferred.
- **Design language**: `high-end-visual-design` skill, applied consistently across every screen.

## Human-owned prerequisites
- [x] **USDA FDC API key** — obtained by user, stored in `.env` (gitignored, not committed).
- [x] `NEON_API_KEY` — already present in environment, provisioning can proceed automatically.

## Units

### Unit 1 — Repo scaffold
Git init, `.gitignore` (node_modules, .env, .neon, dist, .DS_Store), project root `CLAUDE.md` (records the decisions above), README (what/setup/run), pnpm workspace with `client/`, `server/`, `shared/`, `packageManager` field, base TS configs (`strict: true`), Tailwind v4 in client, Hono skeleton in server with a health-check route, `.env.example`.
**Acceptance**: `pnpm install` succeeds; `pnpm dev` boots client (Vite default page) and server (health-check route responds 200) with no TS errors.
**Out of scope**: any DB, any real routes/UI beyond a health check.

### Unit 2 — Database provisioning + schema
`neon link` / `neonctl` to create the Neon project and pull `DATABASE_URL` into `.env` (pooled endpoint), Drizzle schema in `shared/schema.ts`: `foods`, `food_logs`, `goals`, `health_score_settings`. Generate + run first migration. Server connects via `@neondatabase/serverless` + Drizzle Neon adapter.
**Acceptance**: migration applies cleanly against the live Neon branch; a small server-side smoke script reads/writes a row in each table successfully.
**Out of scope**: any API routes, any seed/real food data.

### Unit 3 — Food data service (USDA + OFF)
Server-side `services/foodSearch.ts`: query USDA FDC and Open Food Facts, normalize both into a common shape (name, brand, per-100g macros/calories, sugar, sodium, NOVA group if available, source+external_id), upsert into `foods` cache table, dedupe by source+external_id. `GET /api/foods/search?q=`, `GET /api/foods/:id`, both Zod-validated.
**Acceptance**: hitting `/api/foods/search?q=chicken` returns real merged USDA+OFF results and populates `foods`; repeat search dedupes on write (upserts by `source`+`external_id` instead of creating duplicate rows).
**Note**: implemented as write-side dedup only — every search still re-hits both upstream APIs; it does not skip the network call for already-cached queries (read-side caching). Fine for a low-traffic single-user app; revisit as a future unit if USDA/OFF rate limits or latency become a problem.
**Out of scope**: client UI, barcode lookup.
**Blocked until**: USDA FDC API key is in `.env`.
**Follow-up units logged**: guard `foods` API response with Zod validation before returning to client (tech debt, minor); consider read-side cache hit-avoidance if upstream rate limits bite.

### Unit 4 — Log CRUD API
`POST /api/logs`, `GET /api/logs?date=`, `PATCH /api/logs/:id`, `DELETE /api/logs/:id`. Snapshots macros/calories from the resolved food + amount at creation time. Zod validation on all bodies/params/query.
**Acceptance**: create/edit/delete round-trips correctly; `GET` for a date returns only that date's entries with correct totals.
**Out of scope**: any frontend.

### Unit 5 — Daily log UI
Date navigator, entry list for the selected day, add-entry flow (search modal from Unit 3 → pick serving/amount → log), inline edit/delete, calorie + macro progress bars vs. goals (goals default to 0/unset until Unit 6). Applies `high-end-visual-design`.
**Acceptance**: full day-one golden path works in the browser — search, log, see it on the day view, edit amount, delete, navigate to a past day.
**Out of scope**: goals editing UI, health score.

### Unit 6a — Shared data-layer cleanup (pre-Goals)
From the post-Unit-5 milestone architecture review: three patterns Units 6 and 7 would otherwise each copy forward a second and third time. Small, server/shared-only, no user-visible behavior change.
- Extract the numeric↔string conversion helper duplicated byte-for-byte in `server/src/services/foodSearch.ts` (`numericToString`) and `server/src/services/logs.ts` (`numericToString`) into one shared util (`shared/` or `server/db/`), and use it from both row-mappers.
- Move the daily-totals reducer into `shared/` as one function, replacing the two independent implementations in `server/src/services/logs.ts` (`getLogsByDate`) and `client/src/hooks/useDailyLog.ts` (`computeTotals`). While doing this, decide whether `LogTotals` should carry `sugar`/`sodium` now — `food_logs` already snapshots both, and Unit 7's sugar/sodium + macro-fit health factors will need day-level aggregates.
- Add a real `goalsSchema`/`Goals` type to `shared/src/` (mirroring `foodSchema`/`logEntrySchema`), replacing the ad-hoc `export type Goals = LogTotals` currently defined inside `client/src/components/DaySummary.tsx`. Update `DaySummary` to import it.
**Acceptance**: `pnpm test`/`typecheck` pass; `foodSearch.ts`/`logs.ts` row-mappers and `useDailyLog`/`getLogsByDate` totals both use the shared helpers; no behavior change (existing tests still pass unmodified in assertions, only in what they import).
**Out of scope**: any new goals functionality — that's Unit 6.

### Unit 6 — Goals
`GET/PUT /api/goals` (calories, protein, carbs, fat), settings UI to edit them, wired into Unit 5's progress bars. Builds on Unit 6a's shared `goalsSchema` and numeric-conversion helper. While building the goals service, factor its "read-the-one-settings-row, upsert-the-one-settings-row" logic (both `goals` and `health_score_settings` are singleton tables, id=1 enforced in the app layer) so Unit 7 can reuse it rather than re-deriving the same pattern; also fold the duplicated `idParamSchema`/`logIdParamSchema` in `server/src/routes/foods.ts` and `shared/src/log.ts` into one shared schema if a param schema is needed here.
**Acceptance**: setting goals updates the daily view's progress bars/percentages correctly.

### Unit 7 — Health score engine + settings
Scoring logic per enabled factor (NOVA-based processing score, macro-fit score, sugar/sodium score, variety score), weighted composite, red→green mapping. `GET/PUT /api/health-score/settings`, `GET /api/health-score?date=`. Settings UI: toggle each factor, master on/off. Score badge on daily view (hidden if master toggle is off). Reuses Unit 6's singleton-settings service pattern and, if built by then, Unit 10's `Button`/`IconButton` primitives for the toggle controls.
**Acceptance**: toggling factors changes the computed score and settings persist; turning the master switch off hides the badge without breaking the rest of the page.

### Unit 8 — Deploy
Vercel (client) + Render (server), env vars set on each platform, CORS locked to the deployed frontend origin + localhost. Confirm the full golden path works from a phone browser against the deployed app.
**Acceptance**: logging a food from a phone against the deployed app persists and shows up on reload.

### Unit 9 — Daily log UI polish (from design-reviewer, non-blocking)
Follow-ups logged after Unit 5's design review; none block shipping, bundle whenever convenient (e.g. alongside Unit 6, since it touches the same components):
- `EntryCard`: restore focus to a stable anchor after delete-confirm and after inline save/cancel (currently falls back to `<body>`).
- `DaySummary`/`App`: add a visually-hidden `aria-live="polite"` region announcing the new calorie total after an add/edit/delete.
- `DateNav`: swap the stray `hover:text-black/60` for the existing `text-muted`/`text-ink` tokens; consider styling the native `<input type="date">`'s focus-visible frame so it doesn't look like a stock browser control against the rest of the custom UI.
- Extract the repeated double-card shell markup (`DaySummary`, `EntryList`, `EntryCard`, `AddFoodModal`) into a shared `Card`/`CardShell` component or an `index.css` `@utility`, rather than copy-pasted arbitrary-value Tailwind in four places.
**Out of scope**: anything that changes behavior, not just presentation/accessibility polish.

### Unit 10 — Server error-mapping + client button primitives (from milestone review)
Two more findings from the post-Unit-5 architecture review, lower priority than Unit 6a but worth doing before Unit 7's settings UI (form-heavy, will otherwise copy both patterns a third time):
- Server: the `try/catch (InvalidServingSizeError) → 400` block is duplicated verbatim across the POST/PATCH handlers in `server/src/routes/logs.ts`. Introduce a single `app.onError` handler (or a small `mapError` helper) that maps known domain-error classes to status codes; let handlers throw instead of catching. Keep the existing `null → 404` convention.
- Client: extract minimal `Button`/`IconButton` primitives (or shared class constants) to replace the near-identical pill/icon button class strings currently re-pasted across `DateNav.tsx` (`NAV_BUTTON_CLASSES`), `EntryCard.tsx` (`ICON_BUTTON_CLASSES`/`PILL_BUTTON_CLASSES`), `App.tsx`, and `AddFoodModal.tsx`. Preserve the existing focus-visible/disabled states exactly.
**Acceptance**: `pnpm test`/`typecheck` pass; no visual or behavior change; the four button call sites and the two route handlers use the new shared primitives.
**Out of scope**: any new UI or endpoints.

## Milestone checkpoint
After Unit 5 (core logging loop working end-to-end) and again after Unit 8 (full deploy), run the architecture-reviewer over the whole codebase and fold findings into new units before continuing.

## Status
- Unit 1 — Repo scaffold: **done** (`4d112bd`)
- Unit 2 — Database provisioning + schema: **done** (`8f0061a`)
- Unit 3 — Food data service (USDA + OFF): **done** (`1ea9e75`)
- Unit 4 — Log CRUD API: **done** (`a8f4cb7`)
- Unit 5 — Daily log UI: **done.** Tested (154/154 tests passing, added client-side jsdom/RTL test infra as devDependencies), reviewed by design-reviewer (no blocking findings; two cheap fixes applied inline — `--color-warning` token for the over-goal fill's contrast, confirm-delete icon changed from `Check` to `Trash`; remaining suggestions logged as Unit 9), `noValidate` added to the two amount forms so the custom validation message isn't shadowed by native HTML5 validation. New client dependency `@phosphor-icons/react` was added without being flagged first — noting it here since it's already in and working well; nothing further needed unless you'd rather swap it.
- Unit 6a — Shared data-layer cleanup: **done.** Extracted `numericToString`/`stringToNumber` into `server/src/db/numeric.ts` (server-only — a Drizzle/Postgres driver concern, not a shared domain shape), unified the totals reducer as `computeLogTotals` in `shared/src/log.ts` (replacing separate implementations in `server/src/services/logs.ts` and `client/src/hooks/useDailyLog.ts`), and gave `Goals` a real home in `shared/src/goals.ts` (`DaySummary`/`App` now import it instead of a local type alias). Deliberately did **not** extend `LogTotals` with sugar/sodium — would have required rewriting ~15 existing test assertions, out of scope for a no-behavior-change refactor; deferred to whoever builds Unit 7 (per-entry sugar/sodium already round-trip via `LogEntry` in the meantime). Tested: 40 new tests for the extracted utilities (194 total, up from 154), all passing; typecheck/lint clean. One gap the tester found and I fixed inline: `goalsSchema` accepted negative goal values — added `.nonnegative()` to all four fields before Unit 6 could build on it, and updated the test that had documented the gap.
- Unit 6 — Goals: **todo, next up** (Unit 5's `App.tsx` already has a `goals: Goals | null = null` placeholder wired up, with a comment noting Unit 6 just needs to fetch `GET /api/goals` in its place; consumes Unit 6a's shared `goalsSchema` and singleton-settings pattern guidance).
- Unit 7 — Health score engine + settings: todo.
- Unit 8 — Deploy: todo.
- Unit 9 — Daily log UI polish: todo (non-blocking, see above).
- Unit 10 — Server error-mapping + client button primitives: todo (non-blocking, see above).

**Other milestone-review notes (watch-list, not units yet)**: `client/src/lib/api.ts`'s `VITE_API_URL` has no runtime guard if unset (mirrors the server's existing `DATABASE_URL` guard — consider symmetry); `foods.source`/`food_logs.unit` are free-text DB columns cast to TS enums, so a bad write wouldn't be caught at the DB boundary even though Zod enforces it at the API boundary; macro-value rounding/formatting is scattered across `MacroProgress`/`EntryCard`/`AddFoodModal` and could drift; CORS is currently localhost-only, which is correct for now but Unit 8 (Deploy) must remember to add the deployed origin.
