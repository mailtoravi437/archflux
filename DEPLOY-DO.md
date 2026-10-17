# DigitalOcean Setup — ArchFlux ($6/mo Basic Droplet)

## 1. Create Droplet (2 min)

- Go to [cloud.digitalocean.com](https://cloud.digitalocean.com) → Create → Droplets.
- **Image**: Ubuntu 22.04 LTS (x64)
- **Plan**: Basic ($6/mo) — Shared CPU, 1 GB RAM / 1 vCPU, 25 GB SSD
- **Datacenter**: closest to your users (e.g., NYC3, SFO3, AMS3)
- **Authentication**: SSH key (add your `~/.ssh/id_rsa.pub`) — do NOT use password-only.
- **Hostname**: `archflux-server` (optional)
- Click **Create Droplet**

## 2. DigitalOcean Firewall (before deploy)

In DO Dashboard → Networking → Firewalls:

- **Name**: `archflux-fw`
- **Inbound Rules**:
  - SSH: TCP 22 (Your IP / All IPv4)
  - HTTP: TCP 80 (All IPv4)
  - HTTPS: TCP 443 (All IPv4)
- **Outbound**: Allow All (default)
- Apply to droplet: select your new droplet.

This replaces `ufw` — you can skip firewall commands on the server or run both.

## 3. Point domain (optional, 5 min)

If you have a domain in DO (or anywhere):
- Networking → Domains → add `api.yourdomain.com` / `yourdomain.com`
- A record → point to droplet IP.
- Wait 2-5 min for DNS.

## 4. SSH & deploy (follow plan)

```bash
# SSH in
ssh root@YOUR_DROPLET_IP

# Run the server prep from DEPLOY-EASY-COST.md
apt update && apt upgrade -y
apt install -y git docker.io docker-compose curl
# (ufw optional; DO firewall handles it)

# Enable Docker
systemctl enable --now docker
usermod -aG docker root
newgrp docker

# Clone & deploy
mkdir -p /opt/archflux && cd /opt/archflux
git clone https://github.com/YOUR_REPO/archflux.git .
cp .env.example .env
nano .env

# Set secrets
# POSTGRES_PASSWORD=your_strong_pw
# DB_APP_PASSWORD=your_strong_pw
# API_TOKEN=your_long_token
# JWT_SECRET=your_long_secret
# APP_COOKIE_SECURE=true  # if using HTTPS/domain

# Build & start
docker compose -f compose.yml up -d --build
```

Wait 60s, then verify:

```bash
docker compose -f compose.yml ps
curl -sf http://localhost:8080/api/health
curl -sf http://localhost:8080/api/ready
```

## 5. Access from browser

- Direct: `http://YOUR_DROPLET_IP:8080`
- With domain: `http://yourdomain.com:8080` (or set nginx/default.conf to listen on 80 and use domain).

For HTTPS/free SSL:
- Use **Cloudflare** in front (free SSL): point domain to droplet IP, set SSL/TLS to Flexible or Full.
- Or run `certbot` on droplet (`apt install certbot`, `certbot --nginx`).

## 6. DO-specific notes

- **Backups**: DO provides weekly snapshots ($0.20/mo for 1 GB). Enable in droplet → Backups.
- **Monitoring**: DO Monitoring (free graph for CPU, memory, disk) — enable in dashboard.
- **Scaling**: If traffic grows, resize droplet to $12/mo (2 GB) in 2 minutes with a reboot.
- **1-Click Docker**: DO offers a "Docker" image when creating droplet. If you pick it, Docker is pre-installed — skip the `apt install docker.io` step.

## Quick command reference

```bash
# Restart server
cd /opt/archflux && docker compose -f compose.yml restart server

# Update code
cd /opt/archflux && git pull && docker compose -f compose.yml up -d --build

# View logs
cd /opt/archflux && docker compose -f compose.yml logs -f server

# Server reboot
reboot
```
