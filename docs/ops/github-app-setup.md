# GitHub App Setup for ArchFlux Webhooks

This document describes how to set up a GitHub App for receiving push webhooks and syncing `.arch` files to ArchFlux.

## 1. Create a GitHub App

1. Go to **GitHub Settings** → **Developer settings** → **GitHub Apps**
2. Click **New GitHub App**
3. Fill in the basic information:
   - **GitHub App name**: `ArchFlux` (or your organization name)
   - **Homepage URL**: `https://your-archflux-domain.com`
   - **Webhook URL**: `https://your-archflux-domain.com/api/v1/sync/webhook/git`
   - **Webhook secret**: Generate a strong random string (see below)

## 2. Generate Webhook Secret

Generate a strong random secret for webhook verification:

```bash
# Generate a secure random string
openssl rand -hex 32
# Example output: a1b2c3d4e5f6...
```

Save this secret - you'll need it for:
- GitHub App configuration (Webhook secret field)
- ArchFlux environment variable: `GITHUB_WEBHOOK_SECRET`

## 3. Configure Permissions & Events

### Repository Permissions
| Permission | Access | Reason |
|------------|--------|--------|
| **Contents** | Read-only | Fetch `.arch` file contents |
| **Metadata** | Read-only | Repository info (name, owner) |

### Subscribe to Events
- ✅ **Push** - Trigger sync on code pushes

## 4. Configure Environment Variables

Add these to your ArchFlux server environment (`.env` or deployment config):

```bash
# GitHub App credentials
GITHUB_CLIENT_ID=your_github_app_client_id
GITHUB_CLIENT_SECRET=your_github_app_client_secret
GITHUB_WEBHOOK_SECRET=your_generated_webhook_secret

# GitHub API token (for fetching .arch files)
# Can be a Personal Access Token (classic) with `repo` scope
# Or use the GitHub App installation token (recommended)
GITHUB_API_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# GitHub API URL (default: https://api.github.com)
GITHUB_API_URL=https://api.github.com
```

### Getting the GitHub API Token

**Option A: Personal Access Token (Classic)**
1. GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
2. Copy the token

**Option B: GitHub App Installation Token (Recommended for production)**
```bash
# Get installation ID
curl -H "Authorization: Bearer <app_jwt>" \
  https://api.github.com/app/installations

# Get installation token
curl -X POST \
  -H "Authorization: Bearer <app_jwt>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/app/installations/{installation_id}/access_tokens
```

## 5. Verify Webhook Works

1. **Test webhook delivery**:
   - Go to GitHub App settings → Advanced → Webhook deliveries
   - Click "Redeliver" on a recent push event

2. **Check ArchFlux logs**:
   ```bash
   # Check server logs for webhook processing
   docker logs archflux-server -f | grep webhook
   ```

3. **Test with a push**:
   ```bash
   # Make a change to a .arch file in your repo
   echo '{"nodes":[],"edges":[]}' > test.arch
   git add test.arch && git commit -m "test webhook" && git push
   ```

## 6. Webhook Payload Structure

The webhook expects standard GitHub push event payload:

```json
{
  "ref": "refs/heads/main",
  "repository": {
    "full_name": "org/repo"
  },
  "commits": [
    {
      "modified": ["architecture/system.arch"]
    }
  ]
}
```

## 7. Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `Invalid signature` | Check `GITHUB_WEBHOOK_SECRET` matches exactly in both GitHub App and ArchFlux env |
| `Could not fetch .arch file` | Verify `GITHUB_API_TOKEN` has `repo` scope and repo exists |
| `Invalid JSON payload` | Check webhook payload is valid JSON |
| `Event ignored` | Only `push` events are processed |

### Debug Webhook Locally

```bash
# Use ngrok to expose local server
ngrok http 3001

# Update GitHub App webhook URL to ngrok URL
# Webhook URL: https://your-ngrok-url.ngrok.io/api/v1/sync/webhook/git
```

## 8. Security Checklist

- [ ] Webhook secret is 32+ random bytes (use `openssl rand -hex 32`)
- [ ] GitHub App has minimal required permissions (Contents: Read, Metadata: Read)
- [ ] Webhook URL uses HTTPS in production
- [ ] Webhook secret stored in secret manager (not in code)
- [ ] GitHub App token rotated periodically
- [ ] Webhook deliveries monitored for failures

## 8. Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App / App Client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App / App Client Secret |
| `GITHUB_WEBHOOK_SECRET` | Yes | Webhook signature verification secret |
| `GITHUB_API_TOKEN` | Yes | PAT or App installation token for API calls |
| `GITHUB_API_URL` | No | GitHub API base URL (default: https://api.github.com) |
| `GITHUB_WEBHOOK_SECRET` | Yes | HMAC secret for webhook verification |