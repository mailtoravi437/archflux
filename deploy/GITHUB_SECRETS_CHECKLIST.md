# GitHub Secrets required for automatic CI deployment (.github/workflows/deploy.yml)
# Set these at: https://github.com/mailtoravi437/archflux/settings/secrets/actions
# (Repository Settings -> Secrets and variables -> Actions -> New repository secret)

# VM access
VM_HOST=YOUR_VM_EXTERNAL_IP
VM_USER=mailtoravi437    # or your sudo-capable user
VM_SSH_KEY=-----BEGIN OPENSSH PRIVATE KEY-----\n... (full deploy private key)

# Backend database
DATABASE_URL=jdbc:postgresql://127.0.0.1:5432/archflux
DB_USERNAME=archflux_app
DB_PASSWORD=YOUR_REAL_POSTGRES_PASSWORD

# Backend security / app
JWT_SECRET=REPLACE_WITH_OPENSSL_RAND_HEX_32
API_TOKEN=REPLACE_WITH_REAL_TOKEN
APP_COOKIE_SECURE=true
GITHUB_WEBHOOK_SECRET=         # leave empty unless using webhook

# Client env (optional repo Variable, not Secret — visible in logs)
# Set at: https://github.com/mailtoravi437/archflux/settings/variables/actions
# VITE_API_URL=/api
