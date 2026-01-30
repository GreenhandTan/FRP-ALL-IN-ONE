# FRP-ALL-IN-ONE

[简体中文](README.md) | [English](README.en.md) | [繁體中文](README.zh-TW.md)

A web-based FRP intranet tunneling management system. Configure **FRPS**, generate **one-click client deployment scripts**, manage **device registration/heartbeat** and **port mappings** in the browser, with near real-time status/traffic and troubleshooting guidance.

## Author & Community

- Blog: https://greenhandtan.top

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=GreenhandTan/FRP-ALL-IN-ONE&type=date&legend=top-left)](https://www.star-history.com/#GreenhandTan/FRP-ALL-IN-ONE&type=date&legend=top-left)

## Demo Screenshot

<img src="demo.png" alt="FRP-ALL-IN-ONE Demo" width="900" />

## Table of Contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [Quick Start (Server)](#quick-start-server)
- [First-time Workflow](#first-time-workflow)
- [Ports & Security Group](#ports--security-group)
- [Monitoring & Metrics Semantics](#monitoring--metrics-semantics)
- [Common Ops Commands](#common-ops-commands)
- [Troubleshooting](#troubleshooting)
- [Uninstall Client](#uninstall-client)
- [Project Layout](#project-layout)
- [Development](#development)
- [License & Attribution Requirements](#license--attribution-requirements)

## Key Features

- One-click deployment: Docker Compose brings up the Manager, Web UI, and FRPS
- Setup Wizard: configure FRPS bind port, token, and public IP in the UI
- One-click script: generate client script (arch detection, systemd, autostart)
- Agent mechanism: auto register, heartbeat, config sync, and `frpc reload`
- Near real-time dashboard: periodic polling (default every 3 seconds)
- i18n: Chinese/English switching
- Unified dialogs: lightweight custom modals (no browser default alert/confirm)

## Architecture

Runs as **3 containers** (all with `network_mode: host`):

- Web (Nginx + React): management UI (default 80/TCP)
- Backend (FastAPI + SQLite): APIs, config generation, FRPS restart, FRPS Dashboard fetch
- FRPS: FRP server (default 7000/TCP) + Dashboard (default 7500/TCP; restrict to private access)

On each client machine:

- `frpc`: connects to FRPS and carries proxy traffic
- `frp-agent`: registers to the manager, sends heartbeat, pulls mappings, performs `frpc reload`

## Quick Start (Server)

### Prerequisites

- A server with a public IP
- Docker & Docker Compose
- Open ports at minimum: 80/TCP and FRPS bind port (default 7000/TCP)

### Note on China-oriented mirrors (important for overseas users)

Some images/mirror sources in this repository are configured for **users inside mainland China** (e.g. Docker image mirrors in `deploy/docker-compose.yml` and PyPI mirrors in `server/Dockerfile`).  
If you are on an overseas network, you may need to edit those files and replace them with mirrors that best fit your environment before building.

### One-click deployment

```bash
git clone https://github.com/GreenhandTan/FRP-ALL-IN-ONE.git
cd FRP-ALL-IN-ONE/deploy

chmod +x deploy.sh
sudo ./deploy.sh
```

### Default account

| Username | Password |
|---------|----------|
| admin | 123456 |

Change the default password immediately after first login.

### Low-memory servers (512MB–1GB)

```bash
cd FRP-ALL-IN-ONE/deploy
chmod +x setup-swap.sh
sudo ./setup-swap.sh
sudo ./deploy.sh
```

### Data persistence (important)

The current `deploy/docker-compose.yml` does **not** mount the backend SQLite database persistently. If you recreate/clean containers, **device/tunnel data may be lost**.  
FRPS config `deploy/frps.toml` is persisted on the host.

If you need persistence, add a volume mount for the SQLite file (e.g. `frp_manager.db`) in `deploy/docker-compose.yml`.

## First-time Workflow

### 1) Login

Open: `http://<your-server-public-ip>`

### 2) Configure FRPS (Wizard)

Set:

- bind port (default 7000)
- public IP (auto-detect supported; enter manually if detection fails)

After deployment:

- generates `deploy/frps.toml`
- restarts the FRPS container (to apply Token)
- displays Token & public IP in the UI

Public IP detection supports multi-source probing. You can override sources via:

- `PUBLIC_IP_URLS`: comma-separated URL list (optional)

### 3) Deploy client (frpc + frp-agent)

In the wizard “Client Script” step, download/copy the script and run on the intranet machine:

```bash
chmod +x deploy-frpc.sh
sudo ./deploy-frpc.sh
```

The script will:

- download the correct `frpc` binary
- write `/opt/frp/frpc.toml` and systemd unit
- install and start `frp-agent` (registration/heartbeat/config sync)

### 4) Create port mappings

In “Devices”:

1. select a device → add mapping (TCP/UDP/HTTP/HTTPS)
2. wait for agent sync & hot reload (no service restart required)
3. access via `publicIP:remote_port` → `local_ip:local_port`

## Ports & Security Group

Recommended allow rules:

| Port | Protocol | Usage |
|------|----------|------|
| 80 | TCP | Web UI |
| 7000 (or your bindPort) | TCP | frpc control connection |
| 49152-65535 | TCP/UDP | Recommended private port range for mappings (lower collision risk) |

Notes:

- Every `remote_port` you configure must be allowed inbound in your security group/firewall.
- We recommend using the private range `49152-65535`, but it is not mandatory.

Security:

- FRPS Dashboard listens on 7500/TCP by default. Restrict its access (local-only or by firewall/security group).

## Monitoring & Metrics Semantics

- Data source: backend fetches `serverinfo` and `proxy/*` from FRPS Dashboard API.
- Refresh: polling every ~3 seconds (near real-time).
- “Online devices”: based on agent heartbeat `last_seen` (within 30 seconds).
- “Traffic/Conns are 0” common reasons:
  - `frpc` is connected, but no proxy traffic is passing
  - port is not reachable (security group not allowed, not listening, etc.)
  - mapping was just created and not synced/reloaded yet

## Common Ops Commands

### Server (Docker)

```bash
cd FRP-ALL-IN-ONE/deploy

docker-compose ps
docker-compose logs -f

docker-compose restart
docker restart frps

docker-compose down
docker-compose up -d --build
```

### Client (frpc)

```bash
systemctl status frpc --no-pager
journalctl -u frpc -n 200 --no-pager

systemctl restart frpc
```

### Client (frp-agent)

```bash
systemctl status frp-agent --no-pager
journalctl -u frp-agent -n 200 --no-pager

cat /opt/frp/agent.json
```

## Troubleshooting

### Port mapping created but not accessible (SSH 6022→22 example)

Check the path from outside to inside:

1. connectivity from an external machine:
   ```bash
   nc -vz <publicIP> 6022
   ```
2. security group/firewall: allow 6022/TCP (or your chosen port)
3. is FRPS listening (on server):
   ```bash
   ss -lntp | grep :6022 || echo "no listener"
   docker logs frps --tail 200
   ```
4. did the client sync the mapping (on client machine):
   ```bash
   grep -n "6022" /opt/frp/frpc.toml || true
   journalctl -u frp-agent -n 200 --no-pager
   journalctl -u frpc -n 200 --no-pager
   ```
5. is SSH really listening on 22:
   ```bash
   ss -lntp | grep :22 || true
   systemctl status ssh --no-pager || systemctl status sshd --no-pager
   ```

### Device not shown / cannot register

```bash
systemctl status frp-agent --no-pager
cat /opt/frp/agent.json
systemctl cat frp-agent
```

Ensure `FRP_MANAGER_URL` points to your manager and `FRP_MANAGER_REGISTER_TOKEN` is set in the service.

### Token mismatch

If server Token changed after re-deploy, clients must update. Recommended: re-download and run the latest client script; or edit manually:

```bash
nano /opt/frp/frpc.toml
systemctl restart frpc
```

## Uninstall Client

```bash
cd FRP-ALL-IN-ONE/deploy
chmod +x uninstall-frpc.sh
sudo ./uninstall-frpc.sh
```

Uninstall stops/disables `frpc/frp-agent` and cleans `/opt/frp` and systemd units.

## Project Layout

```
FRP-ALL-IN-ONE/
├── agent/                 # device agent (register/heartbeat/config sync)
├── server/                # backend API (FastAPI)
├── frontend/              # web UI (React + Vite)
├── deploy/                # deployment scripts & docker-compose
└── README.md
```

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

Docker is the recommended way to run backend for consistency. If you need local run, refer to `server/` (FastAPI + SQLite).

## License & Attribution Requirements

This project is licensed under the **MIT License**. See [LICENSE](LICENSE).

You may:

- use it for free (personal/organization)
- use it commercially for free
- modify, redistribute, and ship derivatives

You must:

- keep the license and copyright notice
- when re-posting, redistributing, or developing derivatives, attribute the original author as **GreenhandTan**

For alternative licensing/authorization, contact via the blog: https://greenhandtan.top

