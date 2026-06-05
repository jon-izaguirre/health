# Health Data Spec — v1

This document defines how every app in the **Health** project stores and shares data, so that separate trackers (Plate for nutrition, plus future apps for body metrics, workouts, sleep, vitals, labs, supplements) can be combined into one picture later — without any server.

It is the single source of truth. Any new app should read this first and conform to it.

---

## 1. Core principles

1. **The date is the glue.** Every app keys its data by local calendar day in `YYYY-MM-DD` form. This is what lets a dashboard line up "on this day: ate X, lifted Y, weighed Z, slept W."
2. **Offline-first; Drive is the source of truth.** Each app keeps an instant on-device cache (`localStorage`) and syncs it to a shared Google Drive folder, which holds the canonical copy so a new or lost phone restores by signing in. Sync is automatic: pull-on-open (newer wins) and a debounced push-on-change. No live server is ever required, and the app works fully offline.
3. **One common envelope.** Every export uses the same outer structure (Section 2), so any reader recognizes any file.
4. **Two layers per file:** a small shared **`daily`** summary (the part the dashboard reads) and a private **`raw`** block (each app's full detail, for its own restore and drill-down).
5. **Forward-compatible.** Readers ignore fields they don't understand. Adding new metrics never breaks old files.

> **Honest limitation:** apps cannot read each other's on-device storage directly (browser storage is private per web address). Interchange happens through the exported files in Drive, not live in the browser. The dashboard aggregates from files.

---

## 2. The envelope format

Every app exports a single JSON file shaped like this:

```json
{
  "health_app": "plate",
  "version": 1,
  "exportedAt": "2026-05-25T14:30:00.000Z",
  "units": "us",
  "daily": {
    "2026-05-25": { "calories": 1800, "protein_g": 120, "carbs_g": 150, "fat_g": 60 },
    "2026-05-26": { "calories": 1750, "protein_g": 130, "carbs_g": 140, "fat_g": 55 }
  },
  "raw": {
    "updatedAt": "2026-05-26T14:30:00.000Z",
    "...": "app-specific full state — foods, meals, logs, etc."
  }
}
```

Field meanings:

- `health_app` — short id of the source app (`plate`, `body`, `workout`, `sleep`, `vitals`, `labs`, `supplements`).
- `version` — spec version this file follows (currently `1`).
- `exportedAt` — ISO timestamp of the export.
- `units` — `"us"` (lbs / inches / °F) for this project.
- `daily` — the shared layer: a map of date → metrics. Only include dates that have data. Episodic data (a lab panel, a DEXA scan) simply appears on the few dates it happened.
- `raw` — the app's own complete data, in whatever structure that app needs. The dashboard does not read this; only the owning app does (for restore and detailed views).
- `raw.updatedAt` — ISO timestamp of the last local change. **This is the sync reconcile key:** on open, an app compares its local `updatedAt` to the Drive file's `raw.updatedAt` and the newer one wins (last-write-wins). Fine for a single user; clock skew across simultaneous devices is the known edge case.

---

## 3. The metric registry

Every key inside a `daily` date object must come from this registry, so no two apps clash and units are always known. Add new metrics here as needed.

**Source key:** `M` = entered manually · `O` = can come from Oura later · `scan`/`lab` = episodic (only on dates it's recorded).

### Nutrition & intake — owned by `plate`
| Key | Unit | Source |
|---|---|---|
| `calories` | kcal | M |
| `protein_g` | g | M |
| `carbs_g` | g | M |
| `fat_g` | g | M |
| `fiber_g` | g | M |
| `fiber_soluble_g` | g | M |
| `fiber_insoluble_g` | g | M |
| `sugar_g` | g | M |
| `sodium_mg` | mg | M |
| `potassium_mg` | mg | M |
| `calcium_mg` | mg | M |
| `magnesium_mg` | mg | M |
| `chloride_mg` | mg | M |
| `phosphorus_mg` | mg | M |
| `bicarbonate_mg` | mg | M |
| `water_oz` | fl oz | M |
| `caffeine_mg` | mg | M |
| `alcohol_drinks` | standard drinks | M |

### Micronutrients (vitamins & trace minerals) — owned by `plate`
The fuller panel entered in Plate's "Micronutrients" section. All manual; each only appears on days a value was logged.
| Key | Unit | Source |
|---|---|---|
| `vit_e_mg` | mg | M |
| `vit_k_mcg` | mcg | M |
| `thiamin_mg` | mg | M |
| `riboflavin_mg` | mg | M |
| `niacin_mg` | mg | M |
| `pantothenic_mg` | mg | M |
| `vit_b6_mg` | mg | M |
| `biotin_mcg` | mcg | M |
| `folate_mcg` | mcg | M |
| `vit_b12_mcg` | mcg | M |
| `choline_mg` | mg | M |
| `zinc_mg` | mg | M |
| `copper_mg` | mg | M |
| `manganese_mg` | mg | M |
| `selenium_mcg` | mcg | M |
| `iodine_mcg` | mcg | M |
| `chromium_mcg` | mcg | M |
| `molybdenum_mcg` | mcg | M |

### Body metrics — owned by `body`
| Key | Unit | Source |
|---|---|---|
| `weight_lb` | lb | M |
| `bodyfat_pct` | % | M |
| `waist_in` | in | M |
| `hip_in` | in | M |
| `neck_in` | in | M |
| `chest_in` | in | M |
| `shoulders_in` | in | M |
| `bicep_l_in` / `bicep_r_in` | in | M |
| `forearm_l_in` / `forearm_r_in` | in | M |
| `thigh_l_in` / `thigh_r_in` | in | M |
| `calf_l_in` / `calf_r_in` | in | M |

### Body-composition scans — owned by `body` (episodic)
| Key | Unit | Source |
|---|---|---|
| `dexa_bodyfat_pct` | % | scan |
| `dexa_lean_lb` | lb | scan |
| `dexa_fat_lb` | lb | scan |
| `dexa_vat_lb` | lb | scan |
| `dexa_bmd_gcm2` | g/cm² | scan |
| `inbody_smm_lb` | lb (skeletal muscle) | scan |
| `inbody_bodyfat_pct` | % | scan |
| `inbody_vfa` | level | scan |

### Vitals — owned by `vitals`
| Key | Unit | Source |
|---|---|---|
| `rhr_bpm` | bpm | M / O |
| `hrv_ms` | ms | M / O |
| `bp_systolic_mmhg` | mmHg | M |
| `bp_diastolic_mmhg` | mmHg | M |
| `spo2_pct` | % | O |
| `body_temp_f` | °F | M / O |

### Sleep — owned by `sleep` (manual now, Oura later)
| Key | Unit | Source |
|---|---|---|
| `sleep_hr` | hours | M / O |
| `sleep_efficiency_pct` | % | O |
| `sleep_deep_hr` | hours | O |
| `sleep_rem_hr` | hours | O |
| `sleep_light_hr` | hours | O |
| `sleep_latency_min` | min | O |
| `sleep_score` | 0–100 | O |
| `readiness_score` | 0–100 | O |

### Activity & workouts — owned by `workout` (manual now, Oura later)
| Key | Unit | Source |
|---|---|---|
| `steps` | count | M / O |
| `active_kcal` | kcal | M / O |
| `distance_mi` | mi | M / O |
| `workout_minutes` | min | M |
| `workout_volume_lb` | lb (Σ weight × reps) | M |

Per-exercise strength detail (each exercise, its sets of weight × reps) lives in the workout app's `raw` block. The daily layer only carries the rolled-up `workout_volume_lb` / `workout_minutes`. A dashboard wanting a single lift's trend can read that app's `raw`.

### Labs / bloodwork — owned by `labs` (episodic)
| Key | Unit | Source |
|---|---|---|
| `lab_total_chol_mgdl` | mg/dL | lab |
| `lab_ldl_mgdl` | mg/dL | lab |
| `lab_hdl_mgdl` | mg/dL | lab |
| `lab_trig_mgdl` | mg/dL | lab |
| `lab_glucose_mgdl` | mg/dL | lab |
| `lab_a1c_pct` | % | lab |
| `lab_vitd_ngml` | ng/mL | lab |
| `lab_testosterone_ngdl` | ng/dL | lab |
| `lab_tsh_uiuml` | µIU/mL | lab |
| `lab_crp_mgl` | mg/L | lab |
| `lab_ferritin_ngml` | ng/mL | lab |

Extend with any other marker using the pattern `lab_<name>_<unit>`.

### Supplements — owned by `supplements`
| Key | Unit | Source |
|---|---|---|
| `supplements_taken` | count | M |
| `supplements_planned` | count | M |
| `supplements_pct` | % | M |

Which specific supplements, doses, and times live in that app's `raw` block.

---

## 4. Naming conventions

- Lowercase `snake_case`.
- End the name with a unit suffix when the unit isn't obvious: `_lb`, `_in`, `_pct`, `_mg`, `_oz`, `_bpm`, `_ms`, `_hr` (hours), `_min`, `_mgdl`, `_f`.
- Left/right pairs use `_l_` / `_r_` (e.g. `bicep_l_in`).
- One value per key. A reading with several numbers (blood pressure, a scan) becomes several keys on the same date.

---

## 5. Google Drive layout

The shared `DRIVE` module (see BUILD-CONVENTIONS §5) creates and owns a single **`Health`** folder and writes one canonical file per app directly inside it:

```
Health/
  plate-latest.json       ← Plate's canonical data, overwritten on change
  workout-latest.json
  body-latest.json
  sleep-latest.json
  vitals-latest.json
  labs-latest.json
  supplements-latest.json
```

- Each app keeps exactly one `<app>-latest.json`, found by name and overwritten in place (multipart create the first time, `PATCH` media thereafter).
- The `drive.file` scope means an app only sees files **it** created, so the app creates the `Health` folder itself; a manually-made folder of the same name wouldn't be visible to it.
- Flat layout (no per-app subfolders, no dated snapshots) for v1 — simple and enough for restore. The manual Export feature still produces dated `<app>-backup-YYYY-MM-DD.json` files as a separate offline safety net.
- The future dashboard reads every `*-latest.json` and merges their `daily` layers by date.

---

## 6. How a new app conforms (checklist)

1. Keep an on-device cache; key anything time-based by `YYYY-MM-DD`. Stamp `raw.updatedAt` on every change.
2. On export, wrap everything in the Section 2 envelope with your `health_app` id and `version: 1`.
3. Build a `daily` summary using only registry keys (Section 3). Add new keys to the registry if needed.
4. Put full detail in `raw`.
5. On import, accept both this enveloped format (read `raw`) and any older plain backup, so nothing breaks.
6. Sync automatically via the shared `DRIVE` module (BUILD-CONVENTIONS §5): reconcile-on-open and debounced push to `Health/<app>-latest.json`, last-write-wins by `raw.updatedAt`. Keep manual Export/Import as the offline backup.

---

## 7. Versioning & compatibility

- The current spec is `version: 1`.
- Readers must ignore unknown fields and unknown metric keys rather than erroring.
- New metrics or apps = still `version 1` (additive changes don't bump the version).
- The version only increases if the envelope's *shape* changes in a breaking way; a migration note would accompany it.

---

*Spec v1 — the foundation for combining every Health app into one view, while keeping all data yours and serverless.*
