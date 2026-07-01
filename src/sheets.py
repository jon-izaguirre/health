import json
import base64
import gspread
import logging

logger = logging.getLogger(__name__)

HEADERS = {
    "PolarRunningData": [
        "exercise_id", "date", "start_time", "sport", "label", "device", "has_route", "utc_offset",
        "duration_min", "distance_km", "avg_pace_min_km", 
        "avg_hr", "max_hr", "hr_z1_min", "hr_z2_min", 
        "hr_z3_min", "hr_z4_min", "hr_z5_min", "calories", 
        "cardio_load", "muscle_load", "perceived_load", "user_rpe",
        "ascent_m", "descent_m", "running_index",
        "rr_available", "rmssd_ms", "ln_rmssd", "mean_rr_ms", 
        "n_beats", "artifacts_pct", "notes", "imported_at"
    ]
}

class SheetsClient:
    def __init__(self, service_account_json_b64: str, sheet_id: str):
        self.sheet_id = sheet_id
        
        # Decode base64 service account
        try:
            sa_json_str = base64.b64decode(service_account_json_b64).decode('utf-8')
            sa_info = json.loads(sa_json_str)
        except Exception as e:
            logger.error(f"Failed to decode Google Service Account JSON from base64: {e}")
            raise

        self.gc = gspread.service_account_from_dict(sa_info)
        self.sh = self.gc.open_by_key(self.sheet_id)
        self._ensure_tabs()

    def _ensure_tabs(self):
        """Ensure all required tabs exist with proper headers."""
        existing_worksheets = [ws.title for ws in self.sh.worksheets()]
        
        for tab_name, headers in HEADERS.items():
            if tab_name not in existing_worksheets:
                logger.info(f"Creating missing tab: {tab_name}")
                ws = self.sh.add_worksheet(title=tab_name, rows="1000", cols=str(len(headers)))
                ws.append_row(headers)
            else:
                # Check headers
                ws = self.sh.worksheet(tab_name)
                first_row = ws.row_values(1)
                if not first_row:
                    ws.append_row(headers)

    def get_existing_exercise_ids(self):
        """Returns a set of exercise_ids already in the PolarRunningData tab."""
        ws = self.sh.worksheet("PolarRunningData")
        try:
            # Column A is exercise_id
            col_a = ws.col_values(1)
            # Skip header
            return set(col_a[1:]) if len(col_a) > 1 else set()
        except Exception as e:
            logger.error(f"Failed to fetch existing exercise_ids: {e}")
            return set()

    def get_next_empty_row(self, tab_name: str) -> int:
        """Finds the next empty row for a given tab."""
        ws = self.sh.worksheet(tab_name)
        col_1 = ws.col_values(1)
        return len(col_1) + 1

    def batch_append(self, polar_data_rows):
        """
        Write all rows to the PolarRunningData tab.
        """
        if not polar_data_rows:
            return

        next_row = self.get_next_empty_row("PolarRunningData")
        data = [{
            'range': f'PolarRunningData!A{next_row}',
            'values': polar_data_rows
        }]

        body = {
            'valueInputOption': 'USER_ENTERED',
            'data': data
        }

        try:
            self.sh.values_batch_update(body)
            logger.info("Batch update successful.")
        except Exception as e:
            logger.error(f"Batch update failed: {e}")
            raise
