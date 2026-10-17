# GCP e2-micro Setup — ArchFlux (Always Free)

Resource: 1 vCPU, 1 GB RAM, 30 GB disk, US regions (us-west1 / us-central1 / us-east1).

## 1. Create instance (3 min)

GCP Console → Compute Engine → VM instances → Create
- **Name**: `archflux-server`
- **Region**: `us-central1-a` (or any US region for Always Free)
- **Machine**: `e2-micro` (Always Free eligible)
- **Boot disk**: Ubuntu 22.04 LTS, 30 GB
- **Firewall**: allow HTTP (TCP 80), HTTPS (TCP 443), SSH (TCP 22)
- **SSH**: add your `~/.ssh/id_rsa.pub` or use OS Login
- Click **Create**

## 2. GCP Firewall (already set above, but verify)

Network → VPC network → Firewall rules (ensure `default-allow-http` and `default-allow-https` exist, or create custom rules allowing TCP 80, 443, 22).

No `ufw` required unless you prefer double-layer.

## 3. SSH & deploy (same as DO/DEPLOY.md)

```bash
# SSH (use external IP shown in console)
ssh YOUR_USER@YOUR_EXTERNAL_IP

# Install Docker (same commands)
sudo apt update && sudo apt upgrade -y
sudo apt install -y git docker.io docker-compose curl
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker

# Clone
mkdir -p /opt/archflux && cd /opt/archflux
git clone https://github.com/YOUR_REPO/archflux.git .
cp .env.example .env
nano .env
```

Set real secrets in `.env`:
`POSTGRES_PASSWORD`, `DB_APP_PASSWORD`, `API_TOKEN`, `JWT_SECRET`, `APP_COOKIE_SECURE=true`.

## 4. Handle 1 GB RAM (important for e2-micro)

Spring Boot + Postgres + Redis + Nginx can exceed 1 GB. Add swap:

```bash
# Create 2 GB swap file
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Deploy:
```bash
cd /opt/archflux
docker compose -f compose.yml up -d --build
```

Wait 60s, verify:
```bash
docker compose -f compose.yml ps
curl -sf http://localhost:8080/api/health
curl -sf http://localhost:8080/api/ready
```

## 5. Access

- Direct IP: `http://YOUR_EXTERNAL_IP:8080`
- Domain: add A record pointing to External IP; set `APP_COOKIE_SECURE=true`; use Cloudflare for free SSL.

## 6. GCP Always Free limits to watch

- **Disk**: 30 GB max (free). Clean old backups/images.
- **Egress**: 1 GB/day free. Large file uploads/downloads count toward this. Keep API responses small.
- **CPU**: shared / burst. If instance is throttled too often, upgrade to `e2-small` (~$6/mo).
- **Region**: must stay in US (us-west1, us-central1, us-east1) to keep instance free.

## Quick reference

```bash
# Logs
cd /opt/archflux && docker compose -f compose.yml logs -f server

# Restart
docker compose -f compose.yml restart server

# Update
git pull && docker compose -f compose.yml up -d --build

# Monitor memory (to see if 1 GB is tight)
free -h
docker stats
```
