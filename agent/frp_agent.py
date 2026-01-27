import time
import requests
import hashlib
import subprocess
import os
import json
import sys

# Configuration
SERVER_URL = os.environ.get("FRP_MANAGER_URL", "http://localhost")
REGISTER_TOKEN = os.environ.get("FRP_MANAGER_REGISTER_TOKEN", "")
CLIENT_ID = os.environ.get("FRP_CLIENT_ID", "")
CLIENT_TOKEN = os.environ.get("FRP_CLIENT_TOKEN", "")
AGENT_STATE_PATH = os.environ.get("FRP_AGENT_STATE_PATH", "/opt/frp/agent.json")
FRPC_CONFIG_PATH = os.environ.get("FRPC_CONFIG_PATH", "/opt/frp/frpc.toml")
FRPC_BIN = os.environ.get("FRPC_BIN", "/opt/frp/frpc")

def load_state():
    try:
        if os.path.exists(AGENT_STATE_PATH):
            with open(AGENT_STATE_PATH, "r") as f:
                return json.load(f)
    except Exception:
        return {}
    return {}

def save_state(state):
    try:
        os.makedirs(os.path.dirname(AGENT_STATE_PATH), exist_ok=True)
        with open(AGENT_STATE_PATH, "w") as f:
            json.dump(state, f)
        return True
    except Exception:
        return False

def register_if_needed():
    global CLIENT_ID, CLIENT_TOKEN

    state = load_state()
    if not CLIENT_ID:
        CLIENT_ID = state.get("client_id", "")
    if not CLIENT_TOKEN:
        CLIENT_TOKEN = state.get("client_token", "")

    if CLIENT_ID and CLIENT_TOKEN:
        return True

    if not REGISTER_TOKEN:
        print("Missing FRP_MANAGER_REGISTER_TOKEN; cannot register", file=sys.stderr)
        return False

    try:
        name = os.environ.get("FRP_CLIENT_NAME") or os.uname().nodename
    except Exception:
        name = "device"

    try:
        url = f"{SERVER_URL}/api/agent/register"
        resp = requests.post(
            url,
            json={
                "frps_token": REGISTER_TOKEN,
                "name": name,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"Register failed: {resp.status_code} - {resp.text}", file=sys.stderr)
            return False
        data = resp.json()
        CLIENT_ID = data.get("client_id", "")
        CLIENT_TOKEN = data.get("client_token", "")
        if CLIENT_ID and CLIENT_TOKEN:
            save_state({"client_id": CLIENT_ID, "client_token": CLIENT_TOKEN, "name": data.get("name")})
            return True
        return False
    except Exception as e:
        print(f"Register error: {e}", file=sys.stderr)
        return False

def get_remote_config():
    try:
        url = f"{SERVER_URL}/clients/{CLIENT_ID}/config"
        resp = requests.get(url, headers={"X-Client-Token": CLIENT_TOKEN}, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"Error fetching config: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"Connection error: {e}")
        return None

def generate_toml(config_data):
    # 从JSON响应生成基本的TOML配置
    # 假设 'common' 部分已经在文件中，或者我们追加？
    # 策略：读取现有文件以保留 'serverAddr' 等，并替换 'proxies'。
    # 或者：服务器管理一切。
    
    # 对于此 MVP，我们假设追加 proxies 到基础模板或覆盖特定部分。
    # 更简单：生成完整的 'proxies' 部分。
    
    # 但是 frpc.toml 结构是：
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
    # 首先读取现有文件以保留严格的通用配置？
    # 一个健壮的Agent会进行合并。目前，我们读取 'common' 部分并追加。
    
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
    # 需要启用 frpc admin端口 或使用 'frpc reload' 命令
    # 'frpc reload -c frpc.toml'
    try:
        subprocess.run([FRPC_BIN, "reload", "-c", FRPC_CONFIG_PATH], check=False)
        print("Reload command executed.")
    except Exception as e:
        print(f"Failed to reload frpc: {e}")

def heartbeat():
    try:
        url = f"{SERVER_URL}/api/agent/heartbeat"
        requests.post(
            url,
            json={"client_id": CLIENT_ID, "client_token": CLIENT_TOKEN},
            timeout=5,
        )
    except Exception:
        pass

def main():
    if not register_if_needed():
        sys.exit(1)

    print(f"Starting FRP Agent for Client: {CLIENT_ID}")
    last_config_hash = ""
    
    while True:
        heartbeat()
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
