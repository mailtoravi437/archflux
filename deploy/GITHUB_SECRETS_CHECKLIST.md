# GitHub Secrets required for automatic CI deployment (.github/workflows/deploy.yml)
# Set these at: https://github.com/mailtoravi437/archflux/settings/secrets/actions
# (Repository Settings -> Secrets and variables -> Actions -> New repository secret)

# VM access
VM_HOST=203.0.113.45
VM_USER=mailtoravi437    # or your sudo-capable user
VM_SSH_KEY=-----BEGIN OPENSSH PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...

# Backend database
DATABASE_URL=jdbc:postgresql://127.0.0.1:5432/archflux
DB_USERNAME=archflux_app
DB_PASSWORD=K/aoUfN7OxZlq5x9AY43IdtruUYuOhjl

# Backend security / app
JWT_SECRET=d5150374db41aa7b1bf23957bb3294c56d9bb94e7ef3e4358b4021ba96658c56
API_TOKEN=f506189f13b9ff61e04350a8bd983008
APP_COOKIE_SECURE=true
GITHUB_WEBHOOK_SECRET=         # leave empty unless using webhook

# Client env (optional repo Variable, not Secret — visible in logs)
# Set at: https://github.com/mailtoravi437/archflux/settings/variables/actions
# VITE_API_URL=/api
