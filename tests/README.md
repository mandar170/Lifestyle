# Tests

Headless behavior tests for the Nutrition module. They load the **real**
`assets/js/nutrition.js` inside `fixtures/test.html` and only swap the Supabase
client for an in-memory stub (`fixtures/stub-db.js`), so a regression in the
actual app code makes a test fail.

## What's covered

- `specs/meals-merge.test.js` — the single `meals` table with a `status`
  column (planned/logged coexistence, quick-add, display precedence).
- `specs/stock-rpc.test.js` — atomic pantry deduction via the
  `adjust_pantry_quantity` RPC (deduct + clamp, refund, equivalences,
  idempotent commit).
- `specs/search-clear.test.js` — the meal-modal search field resets after a
  food is confirmed.

## Run locally

```bash
cd tests
npm install
npx playwright install chromium   # once, downloads the browser
npm test
```

In a sandbox that already has Playwright + a Chromium build, point the runner
at them instead of installing:

```bash
NODE_PATH=/opt/node22/lib/node_modules PW_CHROMIUM=/opt/pw-browsers/chromium node tests/run.js
```

## CI

`.github/workflows/deploy.yml` runs `node tests/run.js` in a `test` job that
the Netlify deploy depends on — a failing test blocks the deploy. The runner
exits non-zero if any assertion fails or any uncaught JS error fires on the
page.

## Adding a spec

Drop a `*.test.js` file in `specs/` exporting `async function run(page)` that
returns an array of `{ name, ok, expected, actual }` (use the `_assert` helper).
The runner gives each spec a fresh page (so `window.__STORE` starts clean) and
fails the spec on any console/page error.
