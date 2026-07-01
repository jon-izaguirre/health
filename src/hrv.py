import math
import logging

logger = logging.getLogger(__name__)

def compute_hrv(rr_series_ms, exercise_id: str):
    """
    Computes HRV metrics from an array of R-R intervals (in ms).
    
    1. Physiological filter: drop RR < 300 or > 2000 ms.
    2. Ectopic filter: drop RR[i] where |RR[i] - RR[i-1]| > 0.20 * RR[i-1].
    3. Compute RMSSD, lnRMSSD, mean HR, mean RR, artifacts%.
    """
    if not rr_series_ms:
        return None
        
    initial_len = len(rr_series_ms)
    
    # 1. Physiological filter
    rr_phys = [rr for rr in rr_series_ms if 300 <= rr <= 2000]
    
    if not rr_phys:
        return None
        
    # 2. Ectopic filter
    rr_clean = []
    # We keep the first valid physiological beat
    rr_clean.append(rr_phys[0])
    
    for i in range(1, len(rr_phys)):
        prev = rr_clean[-1]
        curr = rr_phys[i]
        
        diff = abs(curr - prev)
        # Drop if difference > 20% of previous
        if diff <= 0.20 * prev:
            rr_clean.append(curr)

    n_beats = len(rr_clean)
    if n_beats < 2:
        return None
        
    artifacts_pct = (1.0 - (n_beats / initial_len)) * 100.0
    
    # 3. RMSSD
    sum_sq_diff = 0.0
    for i in range(1, n_beats):
        diff = rr_clean[i] - rr_clean[i-1]
        sum_sq_diff += diff * diff
        
    mean_sq_diff = sum_sq_diff / (n_beats - 1)
    rmssd = math.sqrt(mean_sq_diff)
    
    ln_rmssd = math.log(rmssd) if rmssd > 0 else 0.0
    
    mean_rr = sum(rr_clean) / n_beats
    mean_hr = 60000.0 / mean_rr if mean_rr > 0 else 0.0
    
    notes = ""
    if artifacts_pct > 20.0:
        notes = "Low confidence: artifacts > 20%"
        
    return {
        "rmssd_ms": round(rmssd, 2),
        "ln_rmssd": round(ln_rmssd, 4),
        "mean_hr": round(mean_hr, 1),
        "mean_rr_ms": round(mean_rr, 1),
        "n_beats": n_beats,
        "artifacts_pct": round(artifacts_pct, 1),
        "source_exercise_id": str(exercise_id),
        "notes": notes
    }
