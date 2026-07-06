# Diet Tracker — Project CLAUDE.md

Project-specific decisions. Shared stack/convention rules live in `~/Documents/fullStack/CLAUDE.md` — this file only records what's specific to this project.

## Scope
- Single implicit user, no auth/login.
- Deployed (Vercel client / Render server) so it's usable from a phone, not just localhost.

## Food data
- Sources: USDA FoodData Central (whole/generic/homemade foods, lab-verified) + Open Food Facts (branded/packaged, barcode-ready, provides NOVA processing group).
- Both are free APIs. Search results are normalized and cached into a local `foods` table — this is not a hand-maintained fake food DB.
- Log entries (`food_logs`) snapshot resolved macros/calories at log time, so later corrections to cached food data never rewrite historical logs.
- Dedupe cached foods by `source` + `external_id`.

## Health score
- Weighted composite, 0–100.
- Four independently togglable factors:
  1. Whole-food / processed — based on NOVA classification.
  2. Macro fit vs. goals.
  3. Sugar / sodium levels.
  4. Food-group variety.
- Master on/off toggle hides the whole feature regardless of individual factor settings.
- Settings persisted in `health_score_settings`.

## Design
- Design skill in use: `high-end-visual-design`, applied consistently across every screen.
- Do not introduce any other aesthetic skill into this project.

## Day-one feature scope
- Search + log + edit + delete + daily view + goals + health score.
- Barcode scanning deferred (not day one).
