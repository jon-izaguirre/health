import os
import sys
from dotenv import load_dotenv
load_dotenv()
import yaml
import logging
from datetime import datetime, timezone, timedelta
import re

from polar_client import PolarClient, PolarAuthError
from sheets import SheetsClient
from fit_parse import parse_fit
from hrv import compute_hrv

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def parse_iso_duration_to_min(duration_str):
    """Parse ISO 8601 duration (e.g., PT1H30M15S) to minutes."""
    if not duration_str:
        return 0.0
    if isinstance(duration_str, (int, float)):
        # If somehow it's already in ms or s, assuming ms if large
        return float(duration_str) / 60000.0
        
    match = re.match(r'^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$', duration_str)
    if not match:
        return 0.0
    
    hours = float(match.group(1) or 0)
    minutes = float(match.group(2) or 0)
    seconds = float(match.group(3) or 0)
    
    return hours * 60.0 + minutes + seconds / 60.0

def load_config():
    with open("config.yaml", "r") as f:
        return yaml.safe_load(f)


# Polar's default 5-zone model, as lower bounds in fraction of HR max
# (Z1 50-60%, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 >=90%). Time below 50% is unzoned.
HR_ZONE_LOWER_BOUNDS = [0.50, 0.60, 0.70, 0.80, 0.90]


def compute_zone_minutes(hr_series, hr_max):
    """Compute minutes spent in each HR zone from a FIT heart-rate stream.

    Polar's non-transactional AccessLink API does not serve per-exercise
    time-in-zone (the /heart-rate-zones sub-resource 404s), and the FIT file
    carries no precomputed zone field either -- so we derive zones from the
    1 Hz HR samples against a max-HR-relative zone model.

    hr_series: list of (elapsed_seconds, hr_bpm). hr_max: int/float bpm.
    Returns [z1, z2, z3, z4, z5] in minutes, rounded to 2 dp.
    """
    z = [0.0] * 5
    if not hr_series or not hr_max:
        return [round(x, 2) for x in z]

    for i, (t, hr) in enumerate(hr_series):
        if hr is None:
            continue
        # Duration this sample represents (gap to the next sample; ~1s at 1 Hz).
        dt = hr_series[i + 1][0] - t if i + 1 < len(hr_series) else 1.0
        if dt <= 0 or dt > 10:  # guard clock gaps / final sample
            dt = 1.0
        frac = hr / hr_max
        for zi in range(4, -1, -1):  # highest zone first
            if frac >= HR_ZONE_LOWER_BOUNDS[zi]:
                z[zi] += dt
                break
        # frac < 0.50 -> unzoned, not counted

    return [round(x / 60.0, 2) for x in z]


def resolve_hr_max(config, polar, user_id):
    """Max HR for zone math: explicit config wins, else derive 220 - age from
    the Polar user's birthdate, else a safe fallback."""
    hr_max = config.get("HR_MAX")
    if hr_max:
        logger.info(f"Using configured HR max: {hr_max}")
        return float(hr_max)
    try:
        info = polar.get_user_info(user_id)
        birthdate = info.get("birthdate")  # "YYYY-MM-DD"
        if birthdate:
            by, bm, bd = (int(x) for x in birthdate.split("-"))
            today = datetime.now()
            age = today.year - by - ((today.month, today.day) < (bm, bd))
            hr_max = 220 - age
            logger.info(f"Derived HR max {hr_max} from birthdate (age {age}).")
            return float(hr_max)
    except Exception as e:
        logger.warning(f"Could not derive HR max from Polar user info: {e}")
    logger.warning("Falling back to default HR max 190 for zone computation.")
    return 190.0


def main():
    logger.info("Starting Polar Sync...")
    
    config = load_config()
    
    access_token = os.environ.get("POLAR_ACCESS_TOKEN")
    user_id = os.environ.get("POLAR_USER_ID")
    sa_json_b64 = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64")
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    
    if not all([access_token, sa_json_b64, sheet_id]):
        logger.error("Missing required environment variables.")
        sys.exit(1)
        
    try:
        sheets = SheetsClient(sa_json_b64, sheet_id)
    except Exception as e:
        logger.error(f"Failed to initialize SheetsClient: {e}")
        sys.exit(1)
        
    try:
        polar = PolarClient(access_token)
        exercises = polar.list_exercises()
    except PolarAuthError as e:
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.error(f"Failed to fetch exercises: {e}")
        sys.exit(1)
        
    hr_max = resolve_hr_max(config, polar, user_id)

    existing_ids = sheets.get_existing_exercise_ids()
    logger.info(f"Found {len(existing_ids)} existing exercises in Sheets.")
    
    polar_data_rows = []
    
    error_msg = ""
    status = "OK"
    
    try:
        for ex_data in exercises:
            # ex_data might be a string URL (transactional API) or a dict containing the summary (non-transactional API)
            if isinstance(ex_data, str):
                url = ex_data
                ex_id = str(url).rstrip('/').split('/')[-1]
                if ex_id in existing_ids:
                    continue
                logger.info(f"Processing new exercise {ex_id}")
                summary = polar.get_exercise_summary(url)
            else:
                summary = ex_data
                ex_id = str(summary.get("id"))
                url = f"/exercises/{ex_id}"
                if ex_id in existing_ids:
                    continue
                logger.info(f"Processing new exercise {ex_id}")
            fit_bytes = polar.get_exercise_fit(url)

            hr_series, rr_series = parse_fit(fit_bytes)
            
            # Start Time and Timezone
            start_time_str = summary.get("start-time", summary.get("startTime", summary.get("start_time", "")))
            
            # Parse start time just for date/time strings
            dt_local = None
            if start_time_str:
                # Remove Z or timezone offsets if present, assume local
                start_time_clean = start_time_str.replace("Z", "")
                try:
                    dt_local = datetime.fromisoformat(start_time_clean)
                except ValueError:
                    dt_local = datetime.now()
            else:
                dt_local = datetime.now()
                
            date_str = dt_local.strftime("%Y-%m-%d")
            time_str = dt_local.strftime("%H:%M:%S")
            
            duration_min = parse_iso_duration_to_min(summary.get("duration", 0))
            distance_km = summary.get("distance", 0) / 1000.0 if summary.get("distance") else 0.0
            
            # Null-safe pace
            avg_pace = 0.0
            if duration_min > 0 and distance_km > 0:
                avg_pace = duration_min / distance_km
                
            # Zones: computed from the FIT HR stream (Polar's API serves no
            # time-in-zone for non-transactional exercises). See compute_zone_minutes.
            z1_min, z2_min, z3_min, z4_min, z5_min = compute_zone_minutes(hr_series, hr_max)
                
            hr_data = summary.get("heart-rate", summary.get("heartRate", summary.get("heart_rate", {})))
            avg_hr = hr_data.get("average", 0)
            max_hr = hr_data.get("maximum", 0)
            
            sport = summary.get("sport", summary.get("detailed-sport-info", summary.get("detailed_sport_info", "")))
            label = summary.get("name", "")
            calories = summary.get("calories", 0)
            
            # Additional Fields
            device = summary.get("device", "")
            has_route = summary.get("has_route", summary.get("has-route", False))
            utc_offset = summary.get("start_time_utc_offset", summary.get("start-time-utc-offset", 0))
            
            t_load = summary.get("training_load_pro", summary.get("training-load-pro", {}))
            cardio_load = t_load.get("cardio_load", t_load.get("cardio-load", ""))
            muscle_load = t_load.get("muscle_load", t_load.get("muscle-load", ""))
            perceived_load = t_load.get("perceived_load", t_load.get("perceived-load", ""))
            user_rpe = t_load.get("user_rpe", t_load.get("user-rpe", ""))
            
            ascent = summary.get("ascent", "")
            descent = summary.get("descent", "")
            running_index = summary.get("running_index", summary.get("running-index", ""))
            
            rr_available = len(rr_series) > 0
            
            # Compute HRV if rest session
            rmssd_ms = ""
            ln_rmssd = ""
            mean_rr_ms = ""
            n_beats = ""
            artifacts_pct = ""
            hrv_notes = ""
            is_rest_session = (duration_min <= config.get("HRV_MAX_DURATION_MIN", 5)) and (config.get("HRV_TAG", "HRV") in label or config.get("HRV_TAG", "HRV") in sport)
            
            if rr_available and is_rest_session:
                hrv_metrics = compute_hrv(rr_series, ex_id)
                if hrv_metrics:
                    rmssd_ms = hrv_metrics["rmssd_ms"]
                    ln_rmssd = hrv_metrics["ln_rmssd"]
                    mean_rr_ms = hrv_metrics["mean_rr_ms"]
                    n_beats = hrv_metrics["n_beats"]
                    artifacts_pct = hrv_metrics["artifacts_pct"]
                    hrv_notes = hrv_metrics["notes"]
            
            polar_data_rows.append([
                ex_id, date_str, time_str, sport, label, device, has_route, utc_offset,
                round(duration_min, 2), round(distance_km, 2), round(avg_pace, 2), 
                avg_hr, max_hr,
                round(z1_min, 2), round(z2_min, 2), round(z3_min, 2), round(z4_min, 2), round(z5_min, 2),
                calories, cardio_load, muscle_load, perceived_load, user_rpe,
                ascent, descent, running_index,
                str(rr_available).upper(), rmssd_ms, ln_rmssd, mean_rr_ms,
                n_beats, artifacts_pct, hrv_notes, datetime.now(timezone.utc).isoformat()
            ])
            
    except Exception as e:
        logger.error(f"Error during sync: {e}", exc_info=True)
        status = "ERROR"
        error_msg = str(e)
    
    # Save to sheets
    try:
        if polar_data_rows:
            logger.info(f"Writing {len(polar_data_rows)} rows to PolarRunningData.")
            sheets.batch_append(polar_data_rows)
        else:
            logger.info("No new data to write.")
    except Exception as e:
        logger.error(f"Failed to write to sheets: {e}")
        sys.exit(1)
        
    polar.close()
    
    if status == "ERROR":
        sys.exit(1)
        
    logger.info("Sync completed successfully.")

if __name__ == "__main__":
    main()
