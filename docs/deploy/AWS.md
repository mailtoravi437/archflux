# ArchFlux on AWS

> Contract: [SERVICES_SPEC §6 / §10](../specs/SERVICES_SPEC.md#10-aws-deployment-target--svc-g20g22).
> Operating the stack (DB bootstrap, health, backup/restore): [DEPLOY.md](DEPLOY.md).

One EC2 instance runs the integrated compose stack (`db`, `redis`, `server`, `web`) plus **Caddy**, which
terminates TLS with Let's Encrypt. CI builds the two images, pushes them to **ECR**, then deploys one service
over SSH with a health-gated rollback.

```
GitHub Actions ── OIDC ──► ECR (archflux-api, archflux-web)
      │                          ▲ pull (instance role)
      └── SSH ─► EC2 /opt/archflux ── caddy :80/:443 ─► web ─► server ─► db, redis
```

| Item | Where |
|---|---|
| Infrastructure | `deploy/aws/cloudformation.yml` |
| Compose overlay (ECR images, required secrets, only 80/443 public) | `deploy/aws/compose.aws.yml` |
| TLS proxy | `deploy/aws/Caddyfile` |
| On-host deploy + rollback | `deploy/aws/remote-deploy.sh` |
| Instance secrets template | `deploy/aws/env.aws.example` → `/opt/archflux/.env` |
| CI/CD | `.github/workflows/{backend,frontend}-deploy.yml`, `.github/actions/aws-deploy` |
| GitHub secrets/variables | [GITHUB_SECRETS.md](GITHUB_SECRETS.md) |

**Cost guide (us-east-1, on-demand):** `t3.small` ≈ $15/mo, 30 GB gp3 ≈ $2.40/mo, Elastic IP free while
attached, ECR storage cents. `t3.micro` (free-tier eligible) works with the 2 GB swap file but is slow.

## 1. Provision (once)

Prerequisites: AWS CLI v2 logged in to the target account, an EC2 key pair, a domain you can point at the
instance.

```bash
aws ec2 create-key-pair --key-name archflux-deploy --query KeyMaterial --output text > archflux-deploy.pem
chmod 600 archflux-deploy.pem

VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNET=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' --output text)

aws cloudformation deploy \
  --stack-name archflux \
  --template-file deploy/aws/cloudformation.yml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides KeyName=archflux-deploy VpcId=$VPC SubnetId=$SUBNET \
      SshCidr=0.0.0.0/0 GitHubRepo=<owner>/<repo>

aws cloudformation describe-stacks --stack-name archflux --query 'Stacks[0].Outputs' --output table
```

- `SshCidr`: GitHub-hosted runners have changing IPs, so CI deploys need `0.0.0.0/0` (key-only auth; Amazon
  Linux disables password login). Use your own `/32` instead if you deploy from a self-hosted runner.
- Already have the GitHub OIDC provider in this account? Add `CreateGitHubOidcProvider=false`.
- Outputs: `PublicIp`, `EcrRegistry`, `DeployRoleArn`, `InstanceId`.

## 2. DNS

Create an `A` record for your domain (e.g. `archflux.example.com`) → `PublicIp`. Wait until it resolves —
Caddy needs it to obtain the certificate on first start.

## 3. Instance secrets (once)

```bash
IP=<PublicIp>
scp -i archflux-deploy.pem deploy/aws/env.aws.example ec2-user@$IP:/opt/archflux/.env
ssh -i archflux-deploy.pem ec2-user@$IP 'chmod 600 /opt/archflux/.env && vi /opt/archflux/.env'
```

Fill every `change-me` (`openssl rand -hex 32` per secret), `APP_DOMAIN`, `ACME_EMAIL`, `ECR_REGISTRY`,
`AWS_REGION`, and the email provider key. These values never leave the instance; CI does not hold them.

> Secrets that were ever committed to git (see SERVICES_SPEC §7) are compromised — generate fresh ones here.

## 4. GitHub configuration

Set the secrets and variables listed in [GITHUB_SECRETS.md](GITHUB_SECRETS.md), and create a GitHub
**Environment** named `production` (optionally with required reviewers — every deploy job waits on it).

## 5. First deploy

Run **Deploy ArchFlux Backend** first (Actions → workflow → *Run workflow*), then **Deploy ArchFlux Frontend**
— `web` waits for a healthy `server`. After that, pushes to `main` deploy whichever service changed.

```bash
curl -fsS https://archflux.example.com/api/health    # {"status":"UP",...}
curl -fsS https://archflux.example.com/api/ready     # {"ready":true}
curl -fsSI https://archflux.example.com/ | head -1    # HTTP/2 200
```

Flyway migrates the schema on the first `server` start and `backend/docker/db-init/01-roles.sh` creates the
least-privilege `archflux_app` role on the fresh volume.

## 6. Day-2 operations

| Task | How |
|---|---|
| Roll back a service | Actions → deploy workflow → *Run workflow* with `image_tag` = previous commit sha |
| Inspect | `ssh ec2-user@$IP 'cd /opt/archflux && docker compose --env-file .env --env-file images.env -f compose.yml -f deploy/aws/compose.aws.yml ps'` |
| Logs | same prefix + `logs -f server` (or `web`, `caddy`) |
| Rotate a secret | edit `/opt/archflux/.env`, then re-run the backend deploy for the current tag |
| Backup | `backend/scripts/backup.sh` against the `db` container (see [DEPLOY.md](DEPLOY.md#backup--restore-phase-2-runbook)); copy dumps off the instance (e.g. `aws s3 cp`) |
| OS patches | `sudo dnf upgrade -y && sudo reboot` (containers restart with `unless-stopped`) |
| Shell without SSH | the instance has the SSM agent + role: `aws ssm start-session --target <InstanceId>` |

The root EBS volume is kept on instance termination (`DeleteOnTermination: false`), so the Postgres data
survives replacing the instance. For managed backups/PITR, move the database to RDS (SVC-O4).

## 7. Sign-in providers

Magic-link email works once `EMAIL_PROVIDER` + key are set. For GitHub/Google OAuth register the redirect
URI `https://<APP_DOMAIN>/login/oauth2/code/<github|google>` and add the client id/secret to `.env`.
Caddy sends `X-Forwarded-Proto: https`, which the web proxy passes to the API so redirect URIs stay `https`.
