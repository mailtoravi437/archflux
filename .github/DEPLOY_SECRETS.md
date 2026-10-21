# Deploy Secrets Checklist

Required in GitHub repo: **Settings > Secrets and variables > Actions > Repository secrets**

| Secret Name | Value / Source | Required For |
|---|---|---|
| `VM_HOST` | `136.64.40.174` (GCP `archflux-server` external IP) | `deploy-backend.yml`, `deploy-frontend.yml` |
| `VM_USER` | `mailtoravi437` (GCP SSH username) | SSH deploy |
| `VM_SSH_KEY` | Private key matching GCP public key (`ecdsa-sha2-nistp256` or `ssh-rsa`) | SSH auth |
| `DATABASE_URL` | `jdbc:postgresql://localhost:5432/archflux` (if DB runs on same VM) | Backend env |
| `DB_USERNAME` | `archflux_app` (or DB owner) | Backend env |
| `DB_PASSWORD` | DB password | Backend env |
| `API_TOKEN` | `f506189f...` (dev default) or production token | Backend env |
| `JWT_SECRET` | Strong random value (`d515...` is dev-only) | Backend env |
| `GITHUB_WEBHOOK_SECRET` | Random webhook secret (if using GitHub webhook sync) | Backend env |

## Where to set
- GitHub: `https://github.com/mailtoravi437/archflux/settings/secrets/actions`
- Add as **Repository secrets** (not environment secrets, unless using environments).

## VM Info (captured)
- Host: `136.64.40.174`
- Instance: `archflux-server` (`us-central1-f`)
- Machine: `e2-micro` (2 vCPU / 1 GB RAM) — consider upgrading before full load.
- Firewall rules already allow `22` (SSH), `80`, `443`, `8080`.
- Network tags: `http-server`, `https-server`
