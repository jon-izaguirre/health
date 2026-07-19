import httpx
import logging
import os

logger = logging.getLogger(__name__)

class PolarAuthError(Exception):
    pass

class PolarAPIError(Exception):
    pass

class PolarClient:
    def __init__(self, access_token: str):
        self.base_url = "https://www.polaraccesslink.com/v3"
        self.access_token = access_token
        self.client = httpx.Client(
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json"
            }
        )

    def _request(self, method: str, path: str, **kwargs):
        url = f"{self.base_url}{path}" if path.startswith("/") else path
        
        try:
            resp = self.client.request(method, url, **kwargs)
            
            if resp.status_code == 401:
                raise PolarAuthError("401 Unauthorized: Your Polar Access Token is invalid or expired. Please re-run auth_bootstrap.py to get a new token.")
            
            resp.raise_for_status()
            return resp
        except httpx.HTTPStatusError as e:
            logger.error(f"Polar API Error {e.response.status_code} for {e.request.url}: {e.response.text}")
            raise PolarAPIError(f"API Error {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            logger.error(f"Polar API Request Error: {str(e)}")
            raise PolarAPIError(f"Request Error: {str(e)}") from e

    def get_user_info(self, user_id: str):
        """Fetch the registered user's profile (includes birthdate, used to
        derive max HR for zone computation)."""
        resp = self._request("GET", f"/users/{user_id}")
        return resp.json()

    def list_exercises(self):
        """
        Fetch non-transactional exercises list.
        Returns a list of exercise URLs.
        """
        resp = self._request("GET", "/exercises")
        return resp.json()

    def get_exercise_summary(self, exercise_url: str):
        resp = self._request("GET", exercise_url)
        return resp.json()

    def get_exercise_fit(self, exercise_url: str) -> bytes:
        """
        Fetch the FIT file for an exercise.
        Returns the raw binary bytes.
        """
        try:
            resp = self._request("GET", f"{exercise_url}/fit")
            if resp.status_code == 204:
                return b""
            return resp.content
        except PolarAPIError as e:
            if "404" in str(e):
                return b""
            raise

    def get_exercise_tcx(self, exercise_url: str) -> bytes:
        """
        Fetch the TCX file.
        Returns the raw binary bytes.
        """
        resp = self._request("GET", f"{exercise_url}/tcx")
        if resp.status_code == 204:
            return b""
        return resp.content
        
    def get_exercise_zones(self, exercise_url: str):
        """
        Fetch heart rate zones.
        """
        try:
            resp = self._request("GET", f"{exercise_url}/heart-rate-zones")
            if resp.status_code == 204:
                return []
            data = resp.json()
            if isinstance(data, dict) and "zone" in data:
                return data["zone"]
            return data
        except PolarAPIError as e:
            if "404" in str(e):
                return []
            raise

    def close(self):
        self.client.close()
