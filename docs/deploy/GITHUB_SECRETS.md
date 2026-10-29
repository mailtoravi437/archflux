# GitHub secrets and variables for AWS deploys

Used by `.github/workflows/backend-deploy.yml`, `.github/workflows/frontend-deploy.yml` and
`.github/actions/aws-deploy` (SERVICES_SPEC §6). Set them in **Settings → Secrets and variables → Actions**.
Application secrets (DB passwords, JWT, API token, email keys) are **not** stored in GitHub — they live only
in `/opt/archflux/.env` on the instance ([AWS.md §3](AWS.md#3-instance-secrets-once)).

## Repository variables

| Name | Value | Source |
|---|---|---|
| `AWS_REGION` | e.g. `us-east-1` | region of the CloudFormation stack |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<account>:role/…` | stack output `DeployRoleArn` |
| `VM_USER` | `ec2-user` (default when unset) | Amazon Linux login user |

## Repository (or `production` environment) secrets

| Name | Value |
|---|---|
| `VM_HOST` | stack output `PublicIp` (or the DNS name) |
| `VM_SSH_KEY` | full private key of the EC2 key pair (`archflux-deploy.pem`) |
| `VM_KNOWN_HOSTS` | recommended: output of `ssh-keyscan -H <PublicIp>` captured once from a trusted network; when unset the deploy trusts the host key on first use |

## Environment

Create an environment named **`production`**. Deploy jobs run in it, so required reviewers or branch rules
configured there gate every deploy. The OIDC trust policy accepts tokens from `main` and from this environment.

No AWS access keys are needed: CI exchanges its GitHub OIDC token for the deploy role, which can only push to
the two ECR repositories.
