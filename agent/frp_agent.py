import time
import requests
import hashlib
import subprocess
import os
import json
import sys

# Configuration
SERVER_URL = os.environ.get("FRP_MANAGER_URL", "http://localhost:8000")
CLIENT_ID = os.environ.get("FRP_CLIENT_ID", "replace_with_your_client_id")
FRPC_CONFIG_PATH = "frpc.toml"

def get_remote_config():
    try:
        url = f"{SERVER_URL}/clients/{CLIENT_ID}/config"
        resp = requests.get(url)
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"Error fetching config: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"Connection error: {e}")
        return None

def generate_toml(config_data):
    # Basic TOML generation from the JSON response
    # This assumes the 'common' section is already in the file or we append?
    # Strategy: Read existing file to keep 'serverAddr' etc, and replace 'proxies'.
    # OR: The server manages EVERYTHING.
    
    # For this MVP, let's assume we append proxies to a base template or overwrite specific sections.
    # Simpler: Generate the WHOLE 'proxies' part.
    
    # But frpc.toml structure is:
    # serverAddr = "..."
    # [[proxies]]
    # name = "..."
    
    lines = []
    # Add proxies
    for proxy in config_data.get("proxies", []):
        lines.append("[[proxies]]")
        lines.append(f'name = "{proxy["name"]}"')
        lines.append(f'type = "{proxy["type"]}"')
        lines.append(f'localIP = "{proxy["localIP"]}"')
        lines.append(f'localPort = {proxy["localPort"]}')
        if "remotePort" in proxy:
            lines.append(f'remotePort = {proxy["remotePort"]}')
        if "customDomains" in proxy:
            domains = '", "'.join(proxy["customDomains"])
            lines.append(f'customDomains = ["{domains}"]')
        lines.append("") # Empty line between proxies
        
    return "\n".join(lines)

def update_config_file(new_toml_content):
    # Read existing file first to preserve strict common config?
    # A robust agent would merge. For now, let's read the 'common' part and append.
    
    common_part = ""
    if os.path.exists(FRPC_CONFIG_PATH):
        with open(FRPC_CONFIG_PATH, "r") as f:
            content = f.read()
            # Split by [[proxies]] and keep the first part
            parts = content.split("[[proxies]]")
            common_part = parts[0]
    else:
        print("Warning: frpc.toml not found using default common")
        common_part = 'serverAddr = "127.0.0.1"\nserverPort = 7000\n\n'

    full_content = common_part.strip() + "\n\n" + new_toml_content
    
    # Check if changed
    current_hash = hashlib.md5(full_content.encode()).hexdigest()
    
    # Write to temp to compare or just write
    with open(FRPC_CONFIG_PATH, "w") as f:
        f.write(full_content)
        
    return True

def reload_frpc():
    print("Reloading frpc...")
    # Requires frpc admin port enabled or using 'frpc reload' command
    # 'frpc reload -c frpc.toml'
    try:
        subprocess.run(["frpc", "reload", "-c", FRPC_CONFIG_PATH], check=True)
        print("Reload command executed.")
    except Exception as e:
        print(f"Failed to reload frpc: {e}")

def main():
    print(f"Starting FRP Agent for Client: {CLIENT_ID}")
    last_config_hash = ""
    
    while True:
        config_data = get_remote_config()
        if config_data:
            new_toml_proxies = generate_toml(config_data)
            
            # Simple content hash check
            current_hash = hashlib.md5(new_toml_proxies.encode()).hexdigest()
            
            if current_hash != last_config_hash:
                print("Config change detected. Updating...")
                update_config_file(new_toml_proxies)
                reload_frpc()
                last_config_hash = current_hash
            else:
                pass # No change
        
        time.sleep(10)

if __name__ == "__main__":
    main()
