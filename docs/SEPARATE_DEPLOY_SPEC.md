# Separate Deployment Specification (SEPARATE_DEPLOY_SPEC.md)

**Version:** 1.0  
**Scope:** Split the current monorepo (`archflux`) into independently deployable frontend and backend repositories with separate CI, separate networks, and cross-origin nginx (no `/api/` proxy).

---

## 1. Separate Frontend Repo Structure

### 1.1 Repository layout (new repo: `archflux-frontend`)

```
archflux-frontend/
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── index.html
├── .env.frontend
├── .gitignore
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   └── ...
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── dist/                 # Vite build output (SPA)
└── .github/workflows/
    ├── deploy-frontend.yml
    └── ci.yml (frontend-only)
```

### 1.2 `package.json` (frontend-only)
- Scripts: `dev`, `build` (`tsc -b && vite build`), `lint` (`oxlint`), `preview`, `test`.
- Dependencies: `react`, `react-dom`, `react-router-dom`, `vite`, `typescript`, `oxlint`.
- No backend build scripts (`server:build`, `mvn`) remain.

### 1.3 `vite.config.ts`
- Builds SPA to `dist/`.
- No server-side proxy (`/api` proxy removed); connects directly to external API.

### 1.4 `.env.frontend`
```
# .env.frontend — build-time only (Vite injects at build)
VITE_API_URL=https://api.archflux.example.com/api
NODE_ENV=production
```
- Used by `npm run build` to bake `VITE_API_URL` into the static bundle.

### 1.5 Build process
```bash
npm ci
npm run lint
npm run build        # produces dist/
```
- Output: `dist/` (hashed assets in `dist/assets/`).
- No server jar; no `mvn`.

### 1.6 CI (`.github/workflows/deploy-frontend.yml`)
- Job `build-frontend`: checkout, `npm ci`, lint, write `.env.production`, build, upload artifact `frontend-dist`.
- Job `deploy-vm`: download artifact, SSH to `VM_HOST` (`VM_USER`, `VM_SSH_KEY`), `rsync -avz --delete` to `/var/www/html`, set permissions (`www-data:www-data`).
- Job does **not** restart a backend service.

---

## 2. Separate Backend Repo Structure

### 2.1 Repository layout (new repo: `archflux-backend`)

```
archflux-backend/
├── server/
│   ├── src/
│   │   ├── main/java/com/archflux/
│   │   └── ...
│   ├── pom.xml
│   └── Dockerfile
├── .env.backend
├── compose.separate.yml      # references ./server
├── deploy/
│   ├── nginx-cross-origin.conf
│   ├── archflux-backend.service
│   ├── backend.env.example
│   └── GITHUB_SECRETS_CHECKLIST.md
├── .github/workflows/
│   ├── deploy-backend.yml
│   └── ci.yml (backend-only)
└── db/                        # migrations, seed (optional)
```

### 2.2 `server/` directory
- Contains Spring Boot source (`src/main/java/...`), `pom.xml`, `Dockerfile`.
- `pom.xml`: `spring-boot-starter-parent` 3.5.16, Java 21, `packaging` jar, final name `app`.
- Build target: `target/app.jar`.

### 2.3 `pom.xml`
- Dependencies: web, actuator, validation, JPA, PostgreSQL, Redis, JWT (`jjwt-api`), SAML2, mail, WebSocket, OpenAPI, testcontainers.
- Plugin: `spring-boot-maven-plugin` produces executable jar.

### 2.4 `Dockerfile`
- Multi-stage or single-stage build based on `maven` + `openjdk-21`.
- Copies `pom.xml` and `src/`, runs `mvn -q package -DskipTests`.
- Final image runs `java -jar target/app.jar` (port 3001).

### 2.5 `.env.backend`
```
# .env.backend — runtime environment for backend service / container
SPRING_PROFILES_ACTIVE=prod
SERVER_PORT=3001
SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/archflux
SPRING_DATASOURCE_USERNAME=archflux_app
SPRING_DATASOURCE_PASSWORD=6TdIPM0JGuJlt/97yQ1zvZyNw52B8PFv
APP_API_TOKEN=d0a83ef72e5fc6ac93086d5f0f4d9668
JWT_SECRET=80351ba5a22b4298f02d96cd8512f03a8119afa58031273ce94e684a1336b844
APP_COOKIE_SECURE=true
REDIS_HOST=redis
GITHUB_WEBHOOK_SECRET=ce9c122e6725e07f328a1dd3e9026ca01040da5b315730bca9921278e90f7636
```
- Used by `compose.separate.yml` and systemd `EnvironmentFile` (`/etc/archflux/backend.env`).

### 2.6 Jar build
```bash
cd server
mvn -q -f pom.xml package -DskipTests
```
- Output: `server/target/app.jar`.

### 2.7 CI (`.github/workflows/deploy-backend.yml`)
- Job `deploy-vm`: checkout backend repo, SSH (`VM_HOST`, `VM_USER`, `VM_SSH_KEY`), `rsync` `server/` to `/var/www/archflux-server/`, write `/etc/archflux/backend.env`, install `openjdk-21-jre-headless` + `maven` + `curl`, build jar on VM, restart `archflux-backend` via `systemctl`, health-check loop (`curl -sf http://127.0.0.1:3001/api/health`).
- `ci.yml` unchanged for backend tests (`mvn test`).

---

## 3. Cross-Origin Nginx Config (`deploy/nginx-cross-origin.conf`)

### File path
`deploy/nginx-cross-origin.conf`

### Purpose
Serves the static frontend (`dist/`) independently from the backend, with **no `/api/` proxy**. The frontend connects directly to the external backend URL (`https://api.archflux.example.com/api`) via `VITE_API_URL` baked at build time.

### Key directives
- `listen 80` / `[::]:80`.
- `root /var/www/html; index index.html;`
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `CSP`, `HSTS`) repeated in each `location` block (nginx inheritance drops server-level `add_header` for locations with their own `add_header`).
- CSP allows `connect-src 'self' https://api.archflux.example.com;` (cross-origin API).
- `gzip on` for text assets.
- `location = /index.html` — `Cache-Control: no-cache, no-store, must-revalidate`.
- `location /assets/` — `Cache-Control: public, max-age=31536000, immutable` (hashed assets).
- `location /` — SPA fallback (`try_files $uri $uri/ /index.html`), `Cache-Control: no-cache`.
- **Explicit note**: "NO `/api/` proxy here — backend is at external URL."

---

## 4. Docker Compose Separate Deployment (`compose.separate.yml`)

### File path
`compose.separate.yml`

### Key design points
- `name: archflux-separate`
- Two independent networks: `backend-net` (bridge) and `frontend-net` (bridge). Services do **not** share a network directly.

### Services
- `server` (backend): image `archflux-server:separate`, container `archflux-server-sep`, port `3001`, env from `.env` + `.env.backend` variables (`JWT_SECRET`, `DB_PASSWORD`, `APP_COOKIE_SECURE`, `GITHUB_WEBHOOK_SECRET`), healthcheck `curl -sf http://127.0.0.1:3001/api/health`, depends on `db` (healthy).
- `db` (postgres:15-alpine): `archflux-db-sep`, volume `pgdata`, network `backend-net`, healthcheck `pg_isready`.
- `redis` (redis:7-alpine): `archflux-redis-sep`, network `backend-net`.
- `web` (frontend): image `archflux-web:separate`, container `archflux-web-sep`, port `${WEB_PORT:-8080}:80`, build context `.`, dockerfile `Dockerfile.web`, build arg `VITE_API_URL=${VITE_API_URL:-/api}`, network `frontend-net`, depends on `server`, healthcheck `curl -sf http://localhost/`.

### Environment variables used by Compose
From `.env` / `.env.backend`:
- `SPRING_PROFILES_ACTIVE`, `SERVER_PORT`, `SPRING_DATASOURCE_URL`, `DB_USERNAME`, `DB_PASSWORD`
- `APP_API_TOKEN`, `JWT_SECRET`, `APP_COOKIE_SECURE`, `REDIS_HOST`, `GITHUB_WEBHOOK_SECRET`
- `VITE_API_URL` (build-time for frontend)

---

## 5. Environment Variables Split (`.env.frontend` vs `.env.backend`)

### `.env.frontend` (frontend repo, build-time)
```
VITE_API_URL=https://api.archflux.example.com/api
NODE_ENV=production
```
- Only used by Vite at build; not runtime server config.

### `.env.backend` (backend repo, runtime / container / systemd)
```
SPRING_PROFILES_ACTIVE=prod
SERVER_PORT=3001
SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/archflux
SPRING_DATASOURCE_USERNAME=archflux_app
SPRING_DATASOURCE_PASSWORD=6TdIPM0JGuJlt/97yQ1zvZyNw52B8PFv
APP_API_TOKEN=d0a83ef72e5fc6ac93086d5f0f4d9668
JWT_SECRET=80351ba5a22b4298f02d96cd8512f03a8119afa58031273ce94e684a1336b844
APP_COOKIE_SECURE=true
REDIS_HOST=redis
GITHUB_WEBHOOK_SECRET=ce9c122e6725e07f328a1dd3e9026ca01040da5b315730bca9921278e90f7636
```
- Used by `compose.separate.yml` (`env_file: .env`), `deploy/archflux-backend.service` (`EnvironmentFile=/etc/archflux/backend.env`), and `.github/workflows/deploy-backend.yml` (written to VM as `/etc/archflux/backend.env`).

---

## 6. GitHub Actions Split

### Unchanged file
`.github/workflows/ci.yml` — runs frontend (`npm run build`, `npm run lint`) and backend (`mvn -q -f server/pom.xml test`) tests independently. No deploy logic; unchanged.

### `deploy-frontend.yml` (`.github/workflows/deploy-frontend.yml`)
- Builds `dist/` with `.env.production` (`VITE_API_URL` from `vars.VITE_API_URL` or secret).
- Deploys static files to VM (`VM_HOST`, `VM_USER`, `VM_SSH_KEY`) via `rsync`.
- No backend interaction; no `systemctl restart`.

### `deploy-backend.yml` (`.github/workflows/deploy-backend.yml`)
- Builds jar on VM (`mvn -q -f pom.xml package -DskipTests`).
- Writes `/etc/archflux/backend.env` from secrets (`DATABASE_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET=80351ba5a22b4298f02d96cd8512f03a8119afa58031273ce94e684a1336b844`, `API_TOKEN=d0a83ef72e5fc6ac93086d5f0f4d9668`, `APP_COOKIE_SECURE=true`, `REDIS_HOST=127.0.0.1`, `GITHUB_WEBHOOK_SECRET=ce9c122e6725e07f328a1dd3e9026ca01040da5b315730bca9921278e90f7636`).
- Restarts `archflux-backend` via `systemctl`.
- Health-check loop on `http://127.0.0.1:3001/api/health`.
- Uses SSH options from `~/.ssh/vm-opts` (`StrictHostKeyChecking`, `BatchMode`, `ServerAliveInterval`).

---

## 7. Production GCP VM Deployment

### 7.1 Direct mode (systemd + nginx, no Docker Compose)
- **Frontend**: `nginx` serves `/var/www/html` (deployed by `deploy-frontend.yml`).
- **Nginx config**: `deploy/nginx-cross-origin.conf` installed at `/etc/nginx/sites-available/default`.
- **Backend**: systemd service `archflux-backend` (`deploy/archflux-backend.service`).
  - `ExecStart`: `/usr/bin/java -jar /var/www/archflux-server/target/app.jar`
  - `EnvironmentFile`: `/etc/archflux/backend.env`
  - `WorkingDirectory`: `/var/www/archflux-server`
  - Hardening: `NoNewPrivileges=true`, `ProtectSystem=full`, `PrivateTmp=true`, `Restart=always`.
- No `/api/` proxy; nginx serves only static SPA assets.

### 7.2 Container mode (Docker Compose for separate deployment)
- `compose.separate.yml` deployed to VM.
- `docker compose -f compose.separate.yml up -d` runs `server`, `db`, `redis`, `web` independently.
- `frontend-net` and `backend-net` isolated; `web` connects to backend via `VITE_API_URL` pointing to external API host (not localhost).
- Healthchecks on `server` (`/api/health`) and `web` (`/`).

---

## 8. SSH Deployment Workflow

### Secrets / variables used
- `VM_HOST`: GCP VM external IP.
- `VM_USER`: sudo-capable user (e.g., `mailtoravi437`).
- `VM_SSH_KEY`: full deploy private key (stored as GitHub Secret).

### SSH options (`~/.ssh/vm-opts` generated by workflow)
```
StrictHostKeyChecking=yes
UserKnownHostsFile=$HOME/.ssh/known_hosts
-i $HOME/.ssh/deploy_key
IdentitiesOnly=yes
BatchMode=yes
ServerAliveInterval=30
ServerAliveCountMax=3
```

### Workflow steps (from `deploy-frontend.yml` and `deploy-backend.yml`)
1. `mkdir -p ~/.ssh`; write `deploy_key` from secret; `chmod 600`; `ssh-keyscan` VM to `known_hosts`.
2. `rsync` via `RSYNC_SSH="ssh $SSH_OPTS"`.
3. For backend: `ssh ... "mvn ... package"`; `ssh ... "sudo systemctl restart archflux-backend"`.
4. For frontend: `ssh ... "sudo chown -R www-data:www-data ${WWW_ROOT}"`; set file permissions (`755` dirs, `644` files, `644` `index.html`).

---

## 9. Security Considerations

### 9.1 Sensitive environment variables
- `JWT_SECRET`: real random hex (e.g., `80351ba5a22b4298f02d96cd8512f03a8119afa58031273ce94e684a1336b844`). Stored in `.env.backend`, GitHub Secret, and `/etc/archflux/backend.env` (chmod 600).
- `DB_PASSWORD`: real PostgreSQL app password (e.g., `6TdIPM0JGuJlt/97yQ1zvZyNw52B8PFv`). Not the default `K/aoUfN7OxZlq5x9AY43IdtruUYuOhjl`.
- `APP_COOKIE_SECURE`: must be `true` in production (`.env.backend`).
- `GITHUB_WEBHOOK_SECRET`: real hex secret (e.g., `ce9c122e6725e07f328a1dd3e9026ca01040da5b315730bca9921278e90f7636`) unless webhook integration active; stored in secret and `.env.backend`.

### 9.2 Nginx security (`deploy/nginx-cross-origin.conf`)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Content-Security-Policy`: restricts `script-src 'self'`, `connect-src 'self' https://api.archflux.example.com` (explicit external API domain), `frame-ancestors 'none'`, `base-uri 'self'`.
- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains`.

### 9.3 Systemd hardening (`deploy/archflux-backend.service`)
- `NoNewPrivileges=true`
- `ProtectSystem=full`
- `PrivateTmp=true`
- `ReadWritePaths` limited to `/var/log/archflux`, `/tmp`, jar directory.

### 9.4 Secret management in GitHub
- `JWT_SECRET`, `DB_PASSWORD`, `API_TOKEN`, `VM_SSH_KEY`, `GITHUB_WEBHOOK_SECRET` stored as repository secrets (not variables, except `VITE_API_URL` which is a variable and visible in logs).
- `.env.backend` and `.env.frontend` are repo templates (`.env.example`) but actual secrets are injected via workflow `run:` blocks or SSH remote files (`/etc/archflux/backend.env`).

---

## 10. Migration from Monorepo to Separate Repos

### 10.1 Split process
1. Create `archflux-frontend` repo from current `src/`, `public/`, `package.json`, `vite.config.ts`, `index.html`, `.env.frontend`.
2. Create `archflux-backend` repo from `server/`, `compose.separate.yml`, `.env.backend`, `deploy/` (without frontend nginx/proxy), `.github/workflows/deploy-backend.yml`.
3. Remove `src/` from backend repo; remove `server/` from frontend repo.

### 10.2 File references after split
- `deploy/` stays in backend repo (`nginx-cross-origin.conf`, `archflux-backend.service`, `GITHUB_SECRETS_CHECKLIST.md`, `backend.env.example`).
- `.github/workflows/` splits: `deploy-frontend.yml` and `ci.yml` (frontend) go to frontend repo; `deploy-backend.yml` and backend tests go to backend repo.
- `compose.separate.yml` stays in backend repo (references `./server` and `.env`).
- `.env.frontend` stays in frontend repo; `.env.backend` stays in backend repo.
- `docs/` can be duplicated or kept in both repos for reference.

### 10.3 Dependency separation
- Frontend no longer depends on `mvn`, Java 21, or `server/pom.xml`.
- Backend no longer depends on `vite`, `react`, `npm build`, or `dist/`.
- Cross-origin connection relies solely on `VITE_API_URL` at build time (frontend) and external domain resolution (nginx / browser).

---

## Reference File Paths Created / Referenced

```
deploy/
├── nginx-cross-origin.conf
├── archflux-backend.service
├── backend.env.example
└── GITHUB_SECRETS_CHECKLIST.md

.github/workflows/
├── deploy-frontend.yml
├── deploy-backend.yml
└── ci.yml         # unchanged

compose.separate.yml
.env.frontend
.env.backend
```

---

*End of specification.*
