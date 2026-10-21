# ArchFlux Production Readiness Specification (PRODUCTION_SPEC.md)

**Version:** 1.0  
**Scope:** Production deployment of the ArchFlux monorepo — frontend SPA, Spring Boot backend, PostgreSQL, Redis, Nginx reverse proxy, and CI/CD pipeline.  
**Reference paths used throughout this spec:**

- `deploy/backend.env.example`
- `.env.frontend`
- `.env.backend`
- `deploy/nginx-default.conf`
- `deploy/nginx-cross-origin.conf`
- `.github/workflows/deploy-frontend.yml`
- `.github/workflows/deploy-backend.yml`
- `deploy/archflux-backend.service`
- `deploy/ecosystem.config.cjs`
- `docs/SEPARATE_DEPLOY_SPEC.md`
- `run-tunnel.txt`

---

## 1. Real Secret Generation Procedures

Every secret must be generated with `openssl`. Placeholders in `deploy/backend.env.example` (`JWT_SECRET=80351ba5...`) and `.env.backend` (`DB_APP_PASSWORD=6TdIPM0JGuJlt...`) are **not** acceptable in production.

### 1.1 JWT signing secret (required in prod)
```bash
openssl rand -hex 32
```
Output format: 64-character hex string (e.g. `80351ba5a22b4298f02d96cd8512f03a8119afa58031273ce94e684a1336b844`).
Use in:
- `.env.backend` (`JWT_SECRET`)
- `.env` (Compose runtime override)
- `deploy/backend.env.example` (after copying to `/etc/archflux/backend.env`)
- `.github/workflows/deploy-backend.yml` (`secrets.JWT_SECRET`)

The server **fails fast** on startup if `JWT_SECRET` is missing or equals a placeholder value.

### 1.2 Database app user password (DB_APP_PASSWORD / DB_PASSWORD)
```bash
openssl rand -base64 24
```
Output format: base64-encoded 24-byte value (e.g. `6TdIPM0JGuJlt/97yQ1zvZyNw52B8PFv`).
Use in:
- `.env.backend` (`SPRING_DATASOURCE_PASSWORD`)
- `compose.yml` (`DB_APP_PASSWORD` / `POSTGRES_PASSWORD` split)
- `compose.separate.yml` (`DB_PASSWORD` / `DB_APP_PASSWORD`)
- `/etc/archflux/backend.env` (systemd `EnvironmentFile` consumed by `deploy/archflux-backend.service`)

### 1.3 Static API token (APP_API_TOKEN)
```bash
openssl rand -hex 16
```
Output format: 32-character hex string (e.g. `d0a83ef72e5fc6ac93086d5f0f4d9668`).
Use in:
- `.env.backend` (`APP_API_TOKEN`)
- `deploy/backend.env.example` (`APP_API_TOKEN`)
- `.env` (Compose runtime)
- `.github/workflows/deploy-backend.yml` (`secrets.API_TOKEN`)

Accepted on `POST /api/v1/sync/webhook/git` (PROD-001) — see webhook/HMAC section below.

### 1.4 GitHub webhook HMAC secret (GITHUB_WEBHOOK_SECRET)
```bash
openssl rand -hex 32
```
Output format: 64-character hex string (e.g. `ce9c122e6725e07f328a1dd3e9026ca01040da5b315730bca9921278e90f7636`).
Use in:
- `.env.backend` (`GITHUB_WEBHOOK_SECRET`)
- `.env` (Compose runtime)
- `.github/workflows/deploy-backend.yml` (`secrets.GITHUB_WEBHOOK_SECRET`)
- `/etc/archflux/backend.env`

**Fail-closed behavior:** If `GITHUB_WEBHOOK_SECRET` is explicitly set to an empty string (`GITHUB_WEBHOOK_SECRET=`) or omitted (default `-`), the webhook endpoint returns a 403-style failure (`"Webhook secret not configured"`). The endpoint does **not** fall back to an open/accept-all mode. This is documented in `compose.yml` (line 60-64) and `run-tunnel.txt`.

---

## 2. Environment File Setup for Production

### 2.1 Frontend build-time environment (`.env.frontend`)
**File path:** `.env.frontend`

```text
# .env.frontend — build-time only (Vite injects at build)
VITE_API_URL=https://api.archflux.example.com/api
NODE_ENV=production
```

Used by Vite at build (`npm run build`). Not served at runtime. For separate deployment (`docs/SEPARATE_DEPLOY_SPEC.md`), the frontend builds with `VITE_API_URL=https://api.archflux.example.com/api` (no same-origin `/api` proxy). See `deploy/nginx-cross-origin.conf` for the corresponding CSP directive (`connect-src 'self' https://api.archflux.example.com;`).

### 2.2 Backend runtime environment (`.env.backend`)
**File path:** `.env.backend`

```text
SPRING_PROFILES_ACTIVE=prod
SERVER_PORT=3001
SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/archflux
SPRING_DATASOURCE_USERNAME=archflux_app
SPRING_DATASOURCE_PASSWORD=<REAL_SECRET_FROM_openssl_rand_base64_24>
APP_API_TOKEN=<REAL_SECRET_FROM_openssl_rand_hex_16>
JWT_SECRET=<REAL_SECRET_FROM_openssl_rand_hex_32>
APP_COOKIE_SECURE=true
REDIS_HOST=redis
GITHUB_WEBHOOK_SECRET=<REAL_SECRET_FROM_openssl_rand_hex_32_OR_EMPTY>
```

Used by:
- `compose.separate.yml` (`env_file: .env` plus `compose.separate.yml` variables)
- `.env` (Docker Compose runtime overrides)
- Systemd (`deploy/archflux-backend.service` reads `/etc/archflux/backend.env`)

### 2.3 System environment (`/etc/archflux/backend.env`)
**File path:** `/etc/archflux/backend.env` (created from `deploy/backend.env.example`)

```text
# /etc/archflux/backend.env  (root:root, chmod 600 — consumed by systemd EnvironmentFile)
SPRING_PROFILES_ACTIVE=prod
SERVER_PORT=3001
SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5432/archflux
SPRING_DATASOURCE_USERNAME=archflux_app
SPRING_DATASOURCE_PASSWORD=<REAL_SECRET>
APP_API_TOKEN=<REAL_SECRET>
JWT_SECRET=<REAL_SECRET>
APP_COOKIE_SECURE=true
REDIS_HOST=127.0.0.1
GITHUB_WEBHOOK_SECRET=<REAL_SECRET_OR_EMPTY>
```

Deployment procedure (from `.github/workflows/deploy-backend.yml`):
```bash
sudo mkdir -p /etc/archflux && sudo chmod 755 /etc/archflux
sudo tee /etc/archflux/backend.env << 'ENVFILE'
... secrets ...
ENVFILE
sudo chmod 600 /etc/archflux/backend.env
sudo chown root:root /etc/archflux/backend.env
```

`deploy/archflux-backend.service` consumes this file via:
```ini
EnvironmentFile=/etc/archflux/backend.env
```

---

## 3. Database Security (DB_APP_USER, Least-Privilege, Migration Posture)

### 3.1 Least-privilege app role
The database creates a dedicated `DB_APP_USER` (`archflux_app` by default) rather than using the superuser (`archflux` / `postgres`).

From `compose.yml` (line 16-18):
```yaml
DB_APP_USER: ${DB_APP_USER:-archflux_app}
DB_APP_PASSWORD: ${DB_APP_PASSWORD:-K/aoUfN7OxZlq5x9AY43IdtruUYuOhjl}
```

From `docker/db-init/01-roles.sh` (referenced in `compose.yml` volume mount `./docker/db-init:/docker-entrypoint-initdb.d:ro`):
- On first init (empty `pgdata` volume), the init script creates `DB_APP_USER` with `LOGIN` and a restricted role.
- The app user does **not** have `CREATEDB`, `CREATEROLE`, or `SUPERUSER` privileges.
- The superuser (`POSTGRES_USER`) remains `archflux` and owns the database schema.

### 3.2 Migration posture
`compose.yml` (line 53-55) shows:
```yaml
SPRING_FLYWAY_ENABLED: "true"
SPRING_FLYWAY_USER: ${POSTGRES_USER:-archflux}
SPRING_FLYWAY_PASSWORD: ${POSTGRES_PASSWORD:-d5150374db41aa7b1bf23957bb3294c56d9bb94e7ef3e4358b4021ba96658c56}
```

In production (`.env.backend` / `/etc/archflux/backend.env`):
- `SPRING_PROFILES_ACTIVE=prod` activates `application-prod.yml` (if present) or `application.yml` production profile.
- Flyway runs at server boot **as the owner** (`POSTGRES_USER`) so `pgcrypto` / `citext` extensions can install. This is a documented follow-up for tightening (see `docs/SEPARATE_DEPLOY_SPEC.md` section 5 and `DEPLOY.md`).
- Migration state is tracked in the `flyway_schema_history` table inside `pgdata`.

### 3.3 Production hardening
- Replace `DB_APP_PASSWORD` and `POSTGRES_PASSWORD` with real `openssl`-generated secrets.
- Never commit real database passwords in `.env.backend`, `.env`, or any workflow file. Inject via `secrets.DB_PASSWORD` (`.github/workflows/deploy-backend.yml`).
- The `pgdata` volume (`compose.yml` line 111) must be backed up before any migration (see Section 13).

---

## 4. JWT Signing Secret Management

### 4.1 Requirement in production
From `deploy/backend.env.example` (line 22):
```text
# JWT signing secret — REQUIRED in prod; the server fails fast on a placeholder.
JWT_SECRET=80351ba5a22b4298f02d96cd8512f03a8119afa58031273ce94e684a1336b844
```

The backend (`Spring Security` / JWT filter) validates `JWT_SECRET` at startup. A missing or placeholder value causes the service to exit before accepting connections. This prevents accidental deployment without authentication.

### 4.2 Rotation procedure
1. **Generate new secret:**
   ```bash
   openssl rand -hex 32
   ```
2. **Update `/etc/archflux/backend.env`:**
   ```bash
   sudo sed -i 's/JWT_SECRET=.*/JWT_SECRET=<NEW_SECRET>/' /etc/archflux/backend.env
   sudo chmod 600 /etc/archflux/backend.env
   ```
3. **Restart service (systemd):**
   ```bash
   sudo systemctl restart archflux-backend
   ```
4. **Restart container (Compose):**
   ```bash
   docker compose -f compose.separate.yml restart server
   ```
5. **Update CI secret (`secrets.JWT_SECRET`)** to match the new value so future deploys use the rotated key.
6. **Old tokens expire** according to the JWT `exp` claim; no manual revocation list is required for stateless JWTs unless a blocklist (Redis) is implemented.

---

## 5. API Token / Webhook Secret Management (Fail-Closed Webhook)

### 5.1 Static token (`APP_API_TOKEN`)
Used for `POST /api/v1/sync/webhook/git` (PROD-001). The server compares the `Authorization` header or request body token against `APP_API_TOKEN`. Any mismatch returns 401.

### 5.2 Webhook endpoint (`GITHUB_WEBHOOK_SECRET`)
From `compose.yml` (line 60-64):
```yaml
GITHUB_WEBHOOK_SECRET: ${GITHUB_WEBHOOK_SECRET:-}
```

From `docs/SEPARATE_DEPLOY_SPEC.md` (section 9.4):
- `GITHUB_WEBHOOK_SECRET` must be a real hex secret (`openssl rand -hex 32`) when GitHub App/webhook integration is active.
- If the webhook is **not** active, set the variable explicitly to an empty string (`GITHUB_WEBHOOK_SECRET=`) — this is **not** the same as omitting it. Omitting falls back to `-` (empty), which is also fail-closed.
- The endpoint verifies HMAC-SHA256 using the secret. Without a secret, the endpoint responds with `"Webhook secret not configured"` and does not process payloads.

From `.env.backend`:
```text
GITHUB_WEBHOOK_SECRET=ce9c122e6725e07f328a1dd3e9026ca01040da5b315730bca9921278e90f7636
```

From `deploy/backend.env.example`:
```text
# GitHub webhook HMAC secret (empty = webhook endpoint fail-closed)
GITHUB_WEBHOOK_SECRET=ce9c122e6725e07f328a1dd3e9026ca01040da5b315730bca9921278e90f7636
```

---

## 6. Redis Session / Session Storage Setup for Production

### 6.1 Configuration
From `.env.backend`:
```text
REDIS_HOST=redis
```

From `compose.yml` (line 97-109):
```yaml
redis:
  image: redis:7-alpine
  restart: unless-stopped
  volumes:
    - redisdata:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 5s
    retries: 5
    start_period: 10s
```

From `compose.separate.yml` (line 65-77): identical `redis` service definition.

### 6.2 Production requirements
- `redis` service runs on `backend-net` (Compose bridge). No external ports are published (`compose.yml` line 100 comment: "No published ports: reachable only via service DNS").
- `REDIS_HOST` points to `redis` (service DNS) in Compose, or `127.0.0.1` in systemd mode (`deploy/archflux-backend.service` uses `/etc/archflux/backend.env` with `REDIS_HOST=127.0.0.1` if Redis runs locally).
- Session cookies (`SESSION_COOKIE_SECURE` / `APP_COOKIE_SECURE`) must be `true` in production. From `compose.yml` (line 59): `SESSION_COOKIE_SECURE: ${APP_COOKIE_SECURE:-false}`. Set `APP_COOKIE_SECURE=true` in `.env.backend` and `.env`.
- Session data persistence: `redisdata` volume (`compose.yml` line 113) must be included in backup strategy (see Section 13).

---

## 7. Nginx Security

### 7.1 Security headers
**File path:** `deploy/nginx-default.conf` (same-origin with `/api/` proxy) and `deploy/nginx-cross-origin.conf` (separate deployment, no `/api/` proxy).

Directives present in both:
```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

`deploy/nginx-cross-origin.conf` (line 18) adds HSTS:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

`deploy/nginx-default.conf` does **not** include HSTS (Cloudflare handles TLS termination). If terminating TLS at nginx, add HSTS explicitly.

### 7.2 Gzip compression
From `deploy/nginx-default.conf` (line 31-33) and `deploy/nginx-cross-origin.conf` (line 20-22):
```nginx
gzip on;
gzip_types text/css application/javascript application/json image/svg+xml;
gzip_min_length 1024;
```

### 7.3 Cache policies
From `deploy/nginx-default.conf`:
- `index.html`: `Cache-Control: no-cache, no-store, must-revalidate`
- `/assets/`: `Cache-Control: public, max-age=31536000, immutable`
- `/` (SPA fallback): `Cache-Control: no-cache`

### 7.4 Cross-origin CSP (`deploy/nginx-cross-origin.conf`)
For separate deployment (`docs/SEPARATE_DEPLOY_SPEC.md` section 3), CSP allows external API:
```nginx
Content-Security-Policy "default-src 'self'; ... connect-src 'self' https://api.archflux.example.com; ..."
```

### 7.5 Reverse proxy (`deploy/nginx-default.conf`)
`/api/` proxy to `127.0.0.1:3001` (Spring Boot) with WebSocket upgrade (`Upgrade` / `Connection` headers), `proxy_http_version 1.1`, `proxy_set_header Host`, `X-Real-IP`, `X-Forwarded-Proto`, timeouts (`proxy_connect_timeout 5s`, `proxy_read_timeout 30s`, `proxy_send_timeout 30s`), and `client_max_body_size 2m`.

---

## 8. Systemd Service Hardening

**File path:** `deploy/archflux-backend.service`

```ini
[Service]
Type=simple
User=archflux
Group=archflux
WorkingDirectory=/var/www/archflux-server
EnvironmentFile=/etc/archflux/backend.env
ExecStartPre=/usr/bin/test -f /var/www/archflux-server/target/app.jar
ExecStart=/usr/bin/java -jar /var/www/archflux-server/target/app.jar
Restart=always
RestartSec=5
StartLimitBurst=10
StartLimitIntervalSec=60
TimeoutStopSec=30
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/var/www/archflux-server/target /tmp /var/log/archflux
PrivateTmp=true
StandardOutput=journal
StandardError=journal
```

Hardening details:
- `NoNewPrivileges=true` — process cannot gain additional privileges via `setuid`.
- `ProtectSystem=full` — mounts `/usr`, `/boot`, `/etc` read-only.
- `PrivateTmp=true` — isolated `/tmp` directory for the service.
- `ReadWritePaths` — explicitly allows writes only to jar directory (`/var/www/archflux-server/target`), `/tmp`, and `/var/log/archflux`.
- `Restart=always` with `RestartSec=5` ensures automatic recovery.
- `ExecStartPre` prevents crash loops if the jar is missing.

---

## 9. Docker Compose Production Settings

### 9.1 Healthchecks (`compose.yml` / `compose.separate.yml`)
From `compose.yml`:

**DB:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER:-archflux} -d $${POSTGRES_DB:-archflux}"]
  interval: 5s
  timeout: 5s
  retries: 5
  start_period: 20s
```

**Server (backend):**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://127.0.0.1:3001/api/health"]
  interval: 10s
  timeout: 5s
  retries: 3
  start_period: 60s
```

**Web (frontend):** baked into `Dockerfile.web` (`HEALTHCHECK`).

**Redis:**
```yaml
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 5s
  timeout: 5s
  retries: 5
  start_period: 10s
```

### 9.2 Stop grace period and init
From `compose.yml` (line 30, 39) and `compose.separate.yml`:
```yaml
stop_grace_period: 30s  # db, server
init: true              # server (SIGTERM forwarding / zombie reaping)
```

### 9.3 Restart policies
```yaml
restart: unless-stopped  # db, server, web, redis
```

### 9.4 Separate deployment (`compose.separate.yml`)
From `docs/SEPARATE_DEPLOY_SPEC.md` (section 4):
- `name: archflux-separate`
- `backend-net` and `frontend-net` isolated bridge networks.
- `web` (frontend) depends on `server` (`condition: service_healthy`) but connects via `VITE_API_URL` (external URL), not localhost.

---

## 10. CI/CD Security

### 10.1 Workflow files
**File paths:** `.github/workflows/deploy-frontend.yml` and `.github/workflows/deploy-backend.yml`

### 10.2 Secrets rotation
From `.github/workflows/deploy-backend.yml` (line 66-88):
```bash
cat <<'ENVFILE' | ssh $SSH_OPTS ... "sudo tee ${BACKEND_ENV_FILE} ..."
JWT_SECRET=${{ secrets.JWT_SECRET }}
DB_PASSWORD=${{ secrets.DB_PASSWORD }}
APP_API_TOKEN=${{ secrets.API_TOKEN }}
GITHUB_WEBHOOK_SECRET=${{ secrets.GITHUB_WEBHOOK_SECRET }}
ENVFILE
```

Rotation steps:
1. Generate new secret (`openssl rand ...`).
2. Update repository secret (`secrets.JWT_SECRET`, `secrets.DB_PASSWORD`, etc.).
3. Push a commit (or redeploy) to propagate the new value to `/etc/archflux/backend.env`.

### 10.3 Deploy key rotation
From `.github/workflows/deploy-frontend.yml` (line 76-94) and `.github/workflows/deploy-backend.yml` (line 25-43):
```bash
mkdir -p ~/.ssh
umask 077
printf '%s\n' "${{ secrets.VM_SSH_KEY }}" > ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
ssh-keyscan -H "${{ secrets.VM_HOST }}" >> ~/.ssh/known_hosts 2>/dev/null || true
chmod 644 ~/.ssh/known_hosts
cat > ~/.ssh/vm-opts <<EOF
-o StrictHostKeyChecking=yes
-o UserKnownHostsFile=$HOME/.ssh/known_hosts
-i $HOME/.ssh/deploy_key
-o IdentitiesOnly=yes
-o BatchMode=yes
-o ServerAliveInterval=30
-o ServerAliveCountMax=3
EOF
```

Rotation procedure:
1. Generate new SSH key pair (`ssh-keygen -t ed25519 -C "archflux-deploy" -f deploy_key`).
2. Add public key to VM `~/.ssh/authorized_keys` (user `mailtoravi437` or equivalent `VM_USER`).
3. Replace `secrets.VM_SSH_KEY` with the new private key.
4. Update `secrets.VM_HOST` if the VM IP/domain changes.
5. Remove old public key from VM `authorized_keys`. Verify `StrictHostKeyChecking=yes` (line 87) to prevent MITM.

### 10.4 `StrictHostKeyChecking` and `known_hosts`
Both workflows enforce:
- `StrictHostKeyChecking=yes`
- `UserKnownHostsFile` explicitly set to `~/.ssh/known_hosts`
- `ssh-keyscan` populates `known_hosts` before connection (line 84 / 33).
- `BatchMode=yes` prevents interactive prompts if host key verification fails.

---

## 11. Monitoring / Logging

### 11.1 Systemd backend (`deploy/archflux-backend.service`)
```bash
# Live logs
journalctl -u archflux-backend -f

# Recent 50 lines (used in deploy-backend.yml on health failure)
journalctl -u archflux-backend -n 50 --no-pager

# Status
systemctl status archflux-backend
```

### 11.2 Docker logs
From `run-tunnel.txt` (line 25-29):
```bash
docker ps
docker logs archflux-server-sep
docker logs archflux-db-sep
docker logs archflux-redis-sep
```

### 11.3 Nginx access / error logs
From `deploy/nginx-default.conf` (comment block) and standard nginx paths:
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

In Docker mode (`compose.yml` / `compose.separate.yml`), nginx logs are written inside the `web` container (`/var/log/nginx/`). Use `docker logs archflux-web-sep` to inspect.

---

## 12. Backup / Recovery

### 12.1 Database (`pgdata` volume)
From `compose.yml` (line 111):
```yaml
volumes:
  pgdata:
```

Backup procedure:
```bash
# Dump SQL (logical backup)
docker exec archflux-db-1 pg_dump -U archflux_app -d archflux -Fc > archflux_db_$(date +%F).sql

# Volume snapshot (physical backup — requires stopping db or using pg_basebackup)
docker run --rm -v archflux_pgdata:/volume -v $(pwd):/backup alpine tar czf /backup/pgdata_$(date +%F).tar.gz -C /volume .
```

Restore:
```bash
# Restore SQL
docker exec -i archflux-db-1 psql -U archflux_app -d archflux < archflux_db_2026-01-01.sql

# Restore volume (stop db, replace volume content, restart)
```

### 12.2 Jar backup (`target/app.jar`)
From `deploy/archflux-backend.service`:
```bash
# Before deploying a new jar
cp /var/www/archflux-server/target/app.jar /backup/app.jar_$(date +%F).jar
```

From `.github/workflows/deploy-backend.yml`: the deploy writes source to `/var/www/archflux-server/` and builds jar in place. A rollback can be performed by copying the previous jar back and running `sudo systemctl restart archflux-backend`.

### 12.3 Config backup (`/etc/archflux/backend.env`)
```bash
sudo cp /etc/archflux/backend.env /etc/archflux/backend.env.bak_$(date +%F)
```

Also back up `.env.backend`, `.env`, `compose.yml`, `deploy/archflux-backend.service`, and `deploy/nginx-default.conf` from the repository (or from the VM `~/archflux` clone in `run-tunnel.txt`).

---

## 13. Migration from Development (Local Dev Mode) to Production

### 13.1 Development mode indicators
From `compose.yml`:
- `SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE:-default}` — default profile (not `prod`).
- `DB_APP_PASSWORD: ${DB_APP_PASSWORD:-K/aoUfN7OxZlq5x9AY43IdtruUYuOhjl}` — placeholder.
- `APP_COOKIE_SECURE: ${APP_COOKIE_SECURE:-false}` — cookies not secure.
- `GITHUB_WEBHOOK_SECRET: ${GITHUB_WEBHOOK_SECRET:-}` — empty (fail-closed).
- `SERVER_PORT: 3001` (same as prod, but no TLS / no nginx proxy).

From `run-tunnel.txt`:
```text
APP_COOKIE_SECURE=true
```
This file is a reminder to set production flags even when deploying via Docker Compose locally.

### 13.2 Production migration checklist
1. **Profile:** Set `SPRING_PROFILES_ACTIVE=prod` (`.env.backend`, `.env`, `/etc/archflux/backend.env`).
2. **Cookie secure:** Set `APP_COOKIE_SECURE=true` (`.env.backend`, `.env`, `/etc/archflux/backend.env`).
3. **JWT secret:** Replace placeholder with real `openssl rand -hex 32` value (`JWT_SECRET`).
4. **DB password:** Replace `K/aoUfN7OxZlq5x9AY43IdtruUYuOhjl` with real `openssl rand -base64 24` (`DB_APP_PASSWORD` / `DB_PASSWORD`).
5. **Webhook secret:** Set to real `openssl rand -hex 32` if webhook is active; otherwise set explicitly to empty (`GITHUB_WEBHOOK_SECRET=`) with documentation of fail-closed behavior.
6. **Nginx:** Switch from default local development (`nginx/default.conf`) to `deploy/nginx-default.conf` or `deploy/nginx-cross-origin.conf` depending on deployment mode (same-origin vs. separate — see `docs/SEPARATE_DEPLOY_SPEC.md`).
7. **Systemd:** Install `deploy/archflux-backend.service` at `/etc/systemd/system/archflux-backend.service`, reload daemon (`systemctl daemon-reload`), enable (`systemctl enable archflux-backend`), and start/restart.
8. **Redis:** Ensure `REDIS_HOST=redis` (Compose) or `127.0.0.1` (systemd local) and `redis` container/service is healthy.
9. **CI/CD:** Verify `.github/workflows/deploy-frontend.yml` uses `vars.VITE_API_URL` (variable, not secret) for build-time URL injection; `.github/workflows/deploy-backend.yml` uses `secrets.*` for all sensitive environment variables.
10. **Health checks:** Confirm `curl -sf http://127.0.0.1:3001/api/health` returns 200 after migration. Confirm `docker ps` shows healthy `server`, `db`, and `redis` containers in production Compose mode.

---

## 14. File Reference Index

All paths mentioned in this specification and their roles:

| Path | Purpose |
|---|---|
| `deploy/backend.env.example` | Template for `/etc/archflux/backend.env`; contains all secret placeholders (`JWT_SECRET`, `DB_PASSWORD`, `APP_API_TOKEN`, `GITHUB_WEBHOOK_SECRET`). |
| `.env.frontend` | Build-time Vite environment (`VITE_API_URL`, `NODE_ENV=production`). |
| `.env.backend` | Runtime backend environment (`SPRING_PROFILES_ACTIVE=prod`, secrets, `APP_COOKIE_SECURE=true`, `REDIS_HOST`). |
| `deploy/nginx-default.conf` | Same-origin nginx config (`/api/` proxy to `127.0.0.1:3001`, CSP, HSTS optional, gzip, cache policies). |
| `deploy/nginx-cross-origin.conf` | Separate deployment nginx (`connect-src` includes external API, `Strict-Transport-Security`, no `/api/` proxy). |
| `.github/workflows/deploy-frontend.yml` | CI deploy for frontend (`npm ci`, `npm run build`, `rsync` to `/var/www/html`, SSH options with `StrictHostKeyChecking=yes`). |
| `.github/workflows/deploy-backend.yml` | CI deploy for backend (`mvn package`, `/etc/archflux/backend.env` injection, `systemctl restart archflux-backend`, health loop). |
| `deploy/archflux-backend.service` | Systemd service definition with hardening (`NoNewPrivileges`, `ProtectSystem=full`, `PrivateTmp`, `ReadWritePaths`, `Restart=always`). |
| `deploy/ecosystem.config.cjs` | PM2 alternative to systemd (`autorestart`, `max_memory_restart`, `watch: false`). |
| `docs/SEPARATE_DEPLOY_SPEC.md` | Full split-repo specification (separate frontend/backend repos, `VITE_API_URL`, cross-origin nginx, Compose separate networks). |
| `run-tunnel.txt` | Deployment commands (`git clone`, `.env` setup, `docker compose -f compose.yml up -d --build`, `curl` health checks, `cloudflared tunnel`). |
| `compose.yml` | Main Docker Compose stack (`db`, `server`, `web`, `redis`; healthchecks, `init: true`, `stop_grace_period`, `restart: unless-stopped`). |
| `compose.separate.yml` | Separate deployment Compose (`name: archflux-separate`, `backend-net` / `frontend-net`, `VITE_API_URL` external). |

---

*End of Production Readiness Specification.*
