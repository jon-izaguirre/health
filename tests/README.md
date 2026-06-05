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
- `serving.test.js` — serving-size auto-scale for database-pulled foods (USDA/barcode rescale per-serving nutrition when the serving size changes; manual entry and editing do not; multi-change and blank/invalid serving are safe).
- `mealflow.test.js` — food/meal sheet UX: nutrition fields in exact FDA label order, tap-to-select-whole-value on nutrition fields, create-a-new-food from inside the meal builder (add + cancel return-to-meal + log-mode unchanged), and meal-ingredient amounts shown in the food's unit (not a raw serving count).
- `logtime.test.js` — optional "time eaten" in the log flow: defaults to now but only saves when accepted (green check), edited/custom times, un-accepting drops it, edit prefills a saved time, the diary shows the formatted time, and entries sort chronologically within a meal section (untimed last) while edit/remove still hit the right entry.
- `electrolytes.test.js` — the 7 essential electrolytes: foodNut scaling for the new fields, calcium label in mg, two-way mirror sync (sodium/potassium/calcium between the normal field and the Electrolytes section), saveFood persistence with no double-count, edit-time auto-open, daily roll-up (with zeros omitted), and USDA mapping for calcium/magnesium/phosphorus.
- `micronutrients.test.js` — the full vitamin + trace-mineral panel generated into the Micronutrients section: field/label/unit generation, foodNut scaling, saveFood persistence, edit-time auto-open, daily roll-up to spec registry keys (decimals preserved, zeros omitted), and USDA mapping for the standard micros.
- `water.test.js` — water entry in the Electrolytes section: liquid-unit choices (fl oz/cups/mL/L), unit→fl oz conversion, saveFood storing canonical fl oz, per-serving scaling, daily `water_oz` roll-up (zeros omitted, and water-only days are no longer dropped), and edit display.

## .gitignore suggestion
```
tests/node_modules/
```
