# Health apps — test suite

Headless tests for the Plate app (and future Health apps). Each suite loads the
real app file from the repo root (`../plate.html`) into a fake browser (jsdom)
and asserts on its actual behavior — so a build can be verified before shipping.

These files are **not** part of the app and are never loaded by it. They live in
the repo only so the suite is durable: each build re-runs and extends them
instead of rebuilding from scratch. **No secrets here** — the USDA API key lives
in the browser (localStorage), never in any committed file.

## Keep in sync
`plate.html` (repo root) and these tests must match — the tests check the exact
shipped version. Whenever the app changes, replace the app file **and** the
contents of this `tests/` folder together, in the same commit.

## Running (only needed if you want to run them; not required to deploy)
Requires Node.js. From inside `tests/`:

```
npm install      # one-time: pulls jsdom (do NOT commit node_modules)
npm test         # runs all suites; exits non-zero if anything fails
```

## Files
- `harness.js` — boots `../plate.html` in jsdom with mocked localStorage / fetch / Google sign-in.
- `runner.js` — tiny assert helpers (ok / eq / near) + pass-fail reporting.
- `baseline.test.js` — boot + core math (dates, scaling, totals, save/persist).
- `helpers.test.js` — pluralized units, brand, unit-family conversion, USDA nutrient mapping, key storage.
- `portion.test.js` — Edit-Entry unit switcher: options offered, unit switching, nutrition invariance, diary rendering.
- `usda.test.js` — USDA search: missing-key prompt, request shape, result mapping, branded scaling, offline/error handling, key card.
- `source.test.js` — food provenance: source inference/labels, source stamped on save (manual/USDA/OFF) and preserved on edit, source shown on the log sheet + in picker/library rows + USDA result dataType.
- `scan.test.js` — barcode flow: found→prefill (tagged off), not-found→explicit message + manual-add (tagged manual), lookup timeout/abort + HTTP-error handling, scan-guard release, and the in-library shortcut (no network call).
- `ui.test.js` — meal-ingredient picker no longer stacks over the meal sheet (closes/reopens correctly, hides log-only buttons); Foods/Meals filter tabs; and a logged meal's ingredient foods shown in the Edit-Entry sheet.
- `decode.test.js` — barcode photo-decode safety: scanner-library load timeouts and the overall decode deadline (spinner can't hang), guard release after timeout, and stale-callback rejection.
- `delivery2a.test.js` — soft-delete (hide-not-erase; history intact; hidden from list/picker/barcode-match), fiber breakdown (soluble/insoluble scaling, daily roll-up, blank-total auto-sum, USDA 295/297, edit reveals breakdown), version/build label, and Settings section order.

## .gitignore suggestion
```
tests/node_modules/
```
