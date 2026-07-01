import os
import sys
import base64
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
import httpx
from dotenv import load_dotenv

load_dotenv()

# These URLs are confirmed for Polar AccessLink API v3
AUTHORIZE_URL = "https://flow.polar.com/oauth2/authorization"
TOKEN_URL = "https://polarremote.com/v2/oauth2/token"
REGISTER_URL = "https://www.polaraccesslink.com/v3/users"
SCOPE = "accesslink.read_all"
REDIRECT_URI = "http://localhost:8080/oauth2_callback"

auth_code = None

class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        
        if "code" in params:
            auth_code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Authorization successful!</h1><p>You can close this window and return to the terminal.</p>")
        else:
            self.send_response(400)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Authorization failed</h1><p>No code found in the URL.</p>")
            
    def log_message(self, format, *args):
        pass # Suppress logging

def main():
    print("=== Polar AccessLink API v3 Bootstrap ===")
    
    client_id = os.getenv("POLAR_CLIENT_ID")
    if not client_id:
        client_id = input("Enter your Polar Client ID: ").strip()
        
    client_secret = os.getenv("POLAR_CLIENT_SECRET")
    if not client_secret:
        client_secret = input("Enter your Polar Client Secret: ").strip()
    
    if not client_id or not client_secret:
        print("Error: Client ID and Client Secret are required.")
        sys.exit(1)
        
    auth_params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPE
    }
    auth_url = f"{AUTHORIZE_URL}?{urllib.parse.urlencode(auth_params)}"
    
    print("\n1. Please open the following URL in your browser to authorize:")
    print(f"\n{auth_url}\n")
    print("Waiting for callback on http://localhost:8080/oauth2_callback...")
    
    server = HTTPServer(('localhost', 8080), CallbackHandler)
    while not auth_code:
        server.handle_request()
        
    print("\nAuthorization code received! Exchanging for token...")
    
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    
    token_response = httpx.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": REDIRECT_URI
        },
        headers={
            "Authorization": f"Basic {auth_header}",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
        }
    )
    
    if token_response.status_code != 200:
        print(f"Failed to get token: {token_response.status_code}")
        print(token_response.text)
        sys.exit(1)
        
    token_data = token_response.json()
    access_token = token_data.get("access_token")
    x_user_id = token_data.get("x_user_id")
    
    if not access_token:
        print("Failed to find access_token in response.")
        sys.exit(1)
        
    print(f"\nGot access token! User ID: {x_user_id}")
    
    print("2. Registering user with the client...")
    
    # Polar requires POST /v3/users to register the user for the client
    # The member-id is just a client-provided id. We can use the x_user_id.
    reg_response = httpx.post(
        REGISTER_URL,
        json={"member-id": str(x_user_id)},
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    )
    
    if reg_response.status_code in (200, 204, 201):
        print("User successfully registered!")
    elif reg_response.status_code == 409:
        print("User is already registered. (This is fine).")
    else:
        print(f"Failed to register user. Status: {reg_response.status_code}")
        print(reg_response.text)
        sys.exit(1)
        
    print("\n=== SETUP COMPLETE ===")
    print("Please save the following values to your GitHub Secrets or .env file:\n")
    print(f"POLAR_ACCESS_TOKEN={access_token}")
    print(f"POLAR_USER_ID={x_user_id}")
    print("\nNote: Since AccessLink v3 tokens are long-lived, you do NOT need to store POLAR_CLIENT_ID or POLAR_CLIENT_SECRET for the recurring job.")

if __name__ == "__main__":
    main()
