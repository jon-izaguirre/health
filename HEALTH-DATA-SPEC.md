# Health Data Spec — v1

This document defines how every app in the **Health** project stores and shares data, so that separate trackers (Plate for nutrition, plus future apps for body metrics, workouts, sleep, vitals, labs, supplements) can be combined into one picture later — without any server.

It is the single source of truth. Any new app should read this first and conform to it.

---

## 1. Core principles

1. **The date is the glue.** Every app keys its data by local calendar day in `YYYY-MM-DD` form. This is what lets a dashboard line up "on this day: ate X, lifted Y, weighed Z, slept W."
2. **Local first, Drive as the hub.** Each app stores its own data on-device. Backups/interchange happen as JSON files in a shared Google Drive folder. No live server is ever required.
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
| `sugar_g` | g | M |
| `sodium_mg` | mg | M |
| `water_oz` | fl oz | M |
| `caffeine_mg` | mg | M |
| `alcohol_drinks` | standard drinks | M |

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

```
Health/
  plate/
    plate-latest.json          ← most recent export, always this name (easy to find / overwrite)
    snapshots/
      plate-2026-05-25.json    ← dated copies for history & safety
  body/
    body-latest.json
  workout/
  sleep/
  vitals/
  labs/
  supplements/
  dashboard/                   ← future read-only app that reads every *-latest.json
```

- Each app keeps one `…-latest.json` that gets overwritten, plus dated snapshots.
- The future dashboard reads the `*-latest.json` files and merges their `daily` layers by date.

---

## 6. How a new app conforms (checklist)

1. Store data on-device; key anything time-based by `YYYY-MM-DD`.
2. On export, wrap everything in the Section 2 envelope with your `health_app` id and `version: 1`.
3. Build a `daily` summary using only registry keys (Section 3). Add new keys to the registry if needed.
4. Put full detail in `raw`.
5. On import, accept both this enveloped format (read `raw`) and any older plain backup, so nothing breaks.
6. Save `…-latest.json` to your app's Drive folder (manually for now; auto-on-open later).

---

## 7. Versioning & compatibility

- The current spec is `version: 1`.
- Readers must ignore unknown fields and unknown metric keys rather than erroring.
- New metrics or apps = still `version 1` (additive changes don't bump the version).
- The version only increases if the envelope's *shape* changes in a breaking way; a migration note would accompany it.

---

*Spec v1 — the foundation for combining every Health app into one view, while keeping all data yours and serverless.*
