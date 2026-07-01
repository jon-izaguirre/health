# Polar H10 to Google Sheets Automated Pipeline

A headless, scheduled batch job that pulls exercise data from Polar AccessLink API v3 and writes it into a Google Sheet. Captures HR time-series, zones, distance/pace, and R-R intervals (for HRV).

## One-Time Setup

1. **Google Cloud Service Account**
   - Create a Google Cloud Project.
   - Enable **Google Sheets API** and **Google Drive API**.
   - Create a Service Account and download the JSON key.
   - Create your target Google Sheet and share it (Editor) with the Service Account email.
   - Get the Sheet ID from the URL.

2. **Polar AccessLink Client Registration**
   - Go to [admin.polaraccesslink.com](https://admin.polaraccesslink.com).
   - Create a client and set the redirect URI to: `http://localhost:8080/callback`.
   - Record your `Client ID` and `Client Secret`.

3. **Authorization Bootstrap**
   - Run the bootstrap script locally to authorize the application and register the user:
     ```bash
     pip install -r requirements.txt
     python auth_bootstrap.py
     ```
   - Follow the instructions to get your `POLAR_ACCESS_TOKEN` and `POLAR_USER_ID`.

4. **GitHub Actions Secrets**
   Set the following secrets in your repository (`Settings > Secrets and variables > Actions`):
   - `POLAR_ACCESS_TOKEN`: output from bootstrap
   - `POLAR_USER_ID`: output from bootstrap
   - `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`: The base64-encoded string of your service account JSON file. You can generate this by running: `cat service_account.json | base64` (on Linux) or `base64 -i service_account.json` (on macOS).
   - `GOOGLE_SHEET_ID`: The ID of your target Google Sheet.

## Polar AccessLink URLs Used

- **Base API URL:** `https://www.polaraccesslink.com/v3`
- **Authorize URL:** `https://flow.polar.com/oauth2/authorization`
- **Token URL:** `https://polarremote.com/v2/oauth2/token`
- **Scope:** `accesslink.read_all`
- **Redirect URI:** `http://localhost:8080/callback`

> **Note on Rate Limits**: Polar AccessLink enforces rate limits (e.g., 15-minute and 24-hour windows). This pipeline is designed to be rate-limit friendly by reading the Google Sheets `Sessions` tab first to deduplicate exercises before ever querying their specific sub-endpoints (`/fit`, `/tcx`, `/heart-rate-zones`). It also batches all Google Sheets writes into a single atomic `batchUpdate` per run.

## Operation

- The job runs on GitHub Actions every 6 hours (`0 */6 * * *`). You can also trigger it manually (`workflow_dispatch`).
- Because AccessLink v3 tokens are long-lived, there is no refresh token flow. If your access token ever expires or is revoked (resulting in a 401 Unauthorized), the pipeline will log an error instructing you to re-run `auth_bootstrap.py` to get a new token.
- **R-R / HRV Note**: By default, an exercise under 5 minutes with "HRV" in the sport name or label is treated as a morning readiness measurement, and RMSSD is computed.
