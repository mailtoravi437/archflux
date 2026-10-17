# ArchFlux — Easy & Cost-Effective Deployment Plan

Goal: get the full stack (React frontend + Spring Boot API + Postgres + Redis) running for **~$5–10/month** with minimal steps and zero complex orchestration.

---

## 1. What you need (one-time)

- A single cheap Linux server (VPS): **Ubuntu 22.04 LTS**, 1 vCPU, 1 GB RAM (e.g., Hetzner CX11 ~$4/mo, DigitalOcean Basic $6/mo).
- A domain or subdomain (optional; can use server IP directly).
- Git + Docker installed on the server (`curl -fsSL https://get.docker.com | sh`).

---

## 2. Server prep (5 minutes)

```bash
# SSH into server
ssh root@YOUR_SERVER_IP

# Update & install essentials
apt update && apt upgrade -y
apt install -y git docker.io docker-compose curl ufw

# Enable Docker
systemctl enable --now docker
usermod -aG docker root
newgrp docker

# Open only needed ports
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

---

## 3. Clone & configure (2 minutes)

```bash
# Clone project
mkdir -p /opt/archflux && cd /opt/archflux
git clone https://github.com/YOUR_REPO/archflux.git .

# Set secrets (never commit these)
cp .env.example .env
# Edit .env with real values
nano .env
```

Required `.env` entries for production:
```bash
POSTGRES_PASSWORD=CHANGE_ME_STRONG
DB_APP_PASSWORD=CHANGE_ME_STRONG
API_TOKEN=CHANGE_ME_LONG_TOKEN
JWT_SECRET=CHANGE_ME_LONG_SECRET
APP_COOKIE_SECURE=true
```

---

## 4. Deploy stack (3 commands)

Run everything through Docker Compose. No Kubernetes, no complex CI/CD.

```bash
cd /opt/archflux

# Build and start all services (db, server, redis, web/nginx)
docker compose -f compose.yml up -d --build

# Check health
sleep 30
docker compose -f compose.yml ps
docker compose -f compose.yml logs --tail=20 server
```

Expected healthy services: `db`, `server`, `redis`, `web`.

---

## 5. Verify it works (30 seconds)

```bash
# Health checks
curl -sf http://localhost:8080/api/health && echo "API OK"
curl -sf http://localhost:8080/api/ready && echo "DB Ready"
curl -sf -I http://localhost:8080/ | head -n 1
```

Open `http://YOUR_SERVER_IP:8080` in a browser. You should see the ArchFlux UI.

---

## 6. Frontend (cost optimization: static hosting option)

If you want to cut server load to near-zero:

```bash
# Build static frontend locally or in CI
npm install
npm run build
```

Upload `dist/` contents to:
- **Cloudflare Pages** (free, CDN included)
- **Netlify** (free tier)
- **GitHub Pages** (free)

Then point `VITE_API_URL` to your server API (`https://api.yourdomain.com/api` or `http://YOUR_IP:3001/api`) and serve the frontend separately. The server continues running only the API + DB + Redis on your cheap VPS.

---

## 7. Keep it cheap long-term

| Cost driver | Easy fix |
|-------------|----------|
| Server size | 1 GB RAM is enough for Postgres 15 + Spring Boot + Redis. Don’t upgrade unless needed. |
| Bandwidth | Use a static frontend host (Cloudflare/Netlify) so only API traffic hits the VPS. |
| Backups | Weekly `docker compose exec db pg_dump` saved to the server disk or an S3 bucket (~$0.02/GB). No managed DB needed. |
| SSL | Use **Cloudflare** (free SSL + CDN) in front of the server instead of paying for a cert manager. |

---

## 8. Quick maintenance commands

```bash
# View logs
cd /opt/archflux
docker compose -f compose.yml logs -f server
docker compose -f compose.yml logs -f db

# Restart one service
docker compose -f compose.yml restart server

# Update to latest code
cd /opt/archflux
git pull
docker compose -f compose.yml up -d --build

# Backup DB
docker compose -f compose.yml exec -T db pg_dump -U archflux archflux | gzip > backup-$(date +%F).sql.gz
```

---

## 9. Security checklist (do not skip)

- [ ] `.env` has strong `POSTGRES_PASSWORD`, `DB_APP_PASSWORD`, `API_TOKEN`, `JWT_SECRET`.
- [ ] `.env` is NOT committed (`.gitignore` covers it; `.dockerignore` excludes `.env`).
- [ ] `APP_COOKIE_SECURE=true` (requires HTTPS; use Cloudflare or certbot for TLS).
- [ ] Server firewall: only 22, 80, 443 open (`ufw` done above).
- [ ] Server runs unattended upgrades (`apt install unattended-upgrades`).

---

## 10. Rollback (30 seconds)

If the new build breaks:

```bash
cd /opt/archflux
docker compose -f compose.yml down
# Restore previous image tags or revert git commit
git checkout <LAST_GOOD_TAG>
docker compose -f compose.yml up -d --build
```

---

## Summary

- **Time to deploy:** ~15 minutes on a fresh $5 VPS.
- **Monthly cost:** ~$5 server (or $0 if using only static hosting + free backend tier — but DB + Redis need a server).
- **Steps:** 1) Buy cheap VPS → 2) Install Docker → 3) Set `.env` → 4) `docker compose up` → 5) Verify.
- **No Kubernetes, no managed DB, no expensive CI pipeline required.**
