import io
from fitparse import FitFile
import logging

logger = logging.getLogger(__name__)

def parse_fit(fit_bytes: bytes):
    """
    Parses a FIT file and extracts:
    1. HR stream: list of (elapsed_s, hr_bpm)
    2. R-R series: list of R-R intervals in milliseconds
    
    Returns: (hr_series, rr_series)
    """
    if not fit_bytes:
        return [], []
        
    try:
        fitfile = FitFile(io.BytesIO(fit_bytes))
    except Exception as e:
        logger.error(f"Failed to parse FIT file: {e}")
        return [], []

    hr_series = []
    rr_series_ms = []
    
    start_timestamp = None

    for record in fitfile.get_messages():
        if record.name == 'record':
            # Extract HR and elapsed time
            timestamp = None
            hr = None
            for data in record:
                if data.name == 'timestamp':
                    timestamp = data.value
                elif data.name == 'heart_rate':
                    hr = data.value
            
            if timestamp and hr is not None:
                if start_timestamp is None:
                    start_timestamp = timestamp
                
                # Calculate elapsed time in seconds
                elapsed_s = (timestamp - start_timestamp).total_seconds()
                hr_series.append((elapsed_s, hr))
                
        elif record.name == 'hrv':
            # HRV message contains one or more R-R intervals
            # In fitparse, the 'time' field is an array of intervals
            for data in record:
                if data.name == 'time':
                    times = data.value
                    if not isinstance(times, (list, tuple)):
                        times = [times]
                    
                    for t in times:
                        if t is None:
                            continue
                        # Some implementations might provide raw 65535 or scaled 65.535 as sentinel
                        # Per spec: filter sentinel values before converting to ms
                        if t == 65535 or t >= 65.0:
                            continue
                        
                        # fitparse might return seconds or raw values depending on the profile.
                        # Polar usually encodes R-R in seconds with 3 decimals (e.g. 0.852)
                        # Let's assume t is in seconds (or scale appropriately)
                        # We'll multiply by 1000 to get ms.
                        rr_ms = t * 1000.0
                        rr_series_ms.append(rr_ms)
                        
    return hr_series, rr_series_ms
