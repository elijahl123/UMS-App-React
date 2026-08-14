# DigitalOcean Staging Deployment

Staging runs immutable Docker images behind the host's existing Nginx and
Certbot installation.

## Topology

```text
Internet
  -> host Nginx and Certbot
  -> 127.0.0.1:8080 (web container)
      -> static Vite application
      -> /api/* -> api:3001 (private Compose network)
  -> DigitalOcean Managed Postgres
```

The images are public and tagged with the exact release commit:

```text
ghcr.io/elijahl123/ums-app-react-api:staging-<commit-sha>
ghcr.io/elijahl123/ums-app-react-web:staging-<commit-sha>
```

## One-time droplet setup

Install Nginx and curl. Then follow Docker's
[official Ubuntu repository setup](https://docs.docker.com/engine/install/ubuntu/)
through the "Install Docker packages" step:

```sh
sudo apt update
sudo apt install -y nginx curl
sudo docker version
sudo docker compose version
sudo docker run --rm hello-world
sudo systemctl enable --now docker
```

The deployment user must have passwordless `sudo` access to `docker`,
`install`, `cp`, and `rm`. Create the protected runtime environment:

```sh
sudo install -d -m 0755 /etc/ums-app-react
sudo install -m 0600 /dev/null /etc/ums-app-react/staging.env
sudo nano /etc/ums-app-react/staging.env
```

Use staging values:

```sh
NODE_ENV=production
APP_ENV=staging
APP_ORIGIN=https://dev.untitledmanagementsoftware.com
APP_ORIGINS=https://dev.untitledmanagementsoftware.com,https://untitledmanagementsoftware.com,capacitor://localhost,http://localhost
APP_BASE_URL=https://dev.untitledmanagementsoftware.com
MARKETING_ORIGIN=https://untitledmanagementsoftware.com
UCD_ACCESS_ENABLED=false
UCD_ACCESS_DOMAIN=ucdconnect.ie
UCD_ACCESS_END_AT=2027-01-18T00:00:00Z
UCD_ACCESS_GRACE_END_AT=2027-02-01T00:00:00Z
SENDGRID_UCD_LAUNCH_UNSUBSCRIBE_GROUP_ID=261009
PALOMAR_ACCESS_ENABLED=false
PALOMAR_ACCESS_DOMAIN=student.palomar.edu
PALOMAR_ACCESS_END_AT=2027-01-18T00:00:00Z
PALOMAR_ACCESS_GRACE_END_AT=2027-02-01T00:00:00Z
SENDGRID_PALOMAR_LAUNCH_UNSUBSCRIBE_GROUP_ID=<dedicated-palomar-sendgrid-group-id>
DATABASE_URL=postgres://<user>:<password>@host.docker.internal:5432/<database>
STAGING_ACCESS_CONTROL_ENABLED=true
STAGING_ADMIN_EMAILS=<comma-separated-admin-emails>
VITE_FIREBASE_API_KEY=<staging-firebase-api-key>
FIREBASE_PROJECT_ID=<staging-firebase-project-id>
FIREBASE_CLIENT_EMAIL=<staging-service-account-email>
FIREBASE_PRIVATE_KEY=<one-line-private-key-with-escaped-newlines>
SENDGRID_API_KEY=<sendgrid-api-key>
SENDGRID_FROM_EMAIL=noreply@untitledmanagementsoftware.com
STRIPE_SECRET_KEY=<staging-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<staging-stripe-webhook-secret>
STRIPE_MONTHLY_PRICE_ID=<staging-monthly-price-id>
STRIPE_YEARLY_PRICE_ID=<staging-yearly-price-id>
VITE_STRIPE_PUBLISHABLE_KEY=<staging-publishable-key>
GOOGLE_CALENDAR_CLIENT_ID=<staging-google-client-id>
GOOGLE_CALENDAR_CLIENT_SECRET=<staging-google-client-secret>
GOOGLE_CALENDAR_REDIRECT_URI=https://dev.untitledmanagementsoftware.com/api/google-calendar/oauth/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<long-random-secret>
```

Before deploying, complete the environment-specific Firebase authorized-domain
setup plus SendGrid domain authentication in
[`email-delivery.md`](email-delivery.md). Staging uses
`https://dev.untitledmanagementsoftware.com/auth/action` as the hosted handler;
the API composes it from Firebase's generated action query and does not depend
on the Firebase template Action URL setting.

The `VITE_*` values used by browser code are built in GitHub Actions, not read
from this file. `VITE_FIREBASE_API_KEY` remains here because the API also uses
it for Firebase Identity Toolkit requests.

If staging Postgres runs directly on the droplet, it must accept connections
from the fixed Compose subnet `172.30.0.0/24`. Keep port 5432 closed in both
the DigitalOcean Cloud Firewall and the host firewall. Add this rule to
`pg_hba.conf`, use `scram-sha-256`, and set Postgres `listen_addresses` so it
can receive the Docker bridge connection:

```text
host  umsdb  ums  172.30.0.0/24  scram-sha-256
```

The API and migration containers resolve the droplet through
`host.docker.internal`; never use `127.0.0.1` for a host database from inside
a container.

Install `deploy/nginx.conf.example` as the site configuration, set
`server_name` to `dev.untitledmanagementsoftware.com`, test it, and reload:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

The host proxy sends all requests to `127.0.0.1:8080`; only ports 80 and 443
should be open in the cloud firewall.

Disable the retired host Node service after the first healthy container release:

```sh
sudo systemctl disable --now ums-app-react || true
```

## GitHub staging environment

Create a GitHub environment named `staging`.

Environment variables:

- `VITE_API_BASE_URL` — blank for same-origin web requests.
- `VITE_FIREBASE_API_KEY`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_IOS_CLIENT_ID` — blank when not needed by the web build.
- `VITE_GOOGLE_IOS_REVERSED_CLIENT_ID` — blank when not needed.
- `VITE_GOOGLE_REDIRECT_URI` — blank to use the current origin.

The caller maps the existing repository secrets `STAGING_SSH_HOST`,
`STAGING_SSH_USER`, optional `STAGING_SSH_PORT`, and
`STAGING_SSH_PRIVATE_KEY` into the reusable release workflow. They do not need
to be duplicated as environment secrets.

Pushing to `staging` runs lint, unit tests, both builds, publishes public GHCR
images, applies migrations, replaces the containers, and checks
`http://127.0.0.1:8080/api/health`.

After deployment, run the real-inbox verification, reset, secondary-address,
and waitlist smoke tests in [`email-delivery.md`](email-delivery.md).

GitHub creates a personal-account GHCR package as private on its first
publication. The first release therefore publishes both packages and stops at
the anonymous-pull check. On Elijah's GitHub profile, open each package,
choose **Package settings → Change visibility → Public**, then rerun the failed
workflow. This is a one-time action; the workflow will not deploy images that
the droplets cannot pull anonymously.

## Rollback and operations

The deploy script leaves the currently running containers untouched while it
pulls images and runs migrations. If the candidate fails its health check, it
automatically restores the previously recorded image tag. Migrations are
forward-only and are not reversed.

Manual rollback:

```sh
sudo /usr/local/bin/ums-rollback
```

Inspect the active release and services:

```sh
sudo cat /opt/ums-app-react/release.env
sudo docker compose \
  --project-directory /opt/ums-app-react \
  --env-file /opt/ums-app-react/release.env \
  -f /opt/ums-app-react/compose.yaml ps
sudo docker compose \
  --project-directory /opt/ums-app-react \
  --env-file /opt/ums-app-react/release.env \
  -f /opt/ums-app-react/compose.yaml logs --tail=100 api web
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS https://dev.untitledmanagementsoftware.com/api/health
```

The deploy script prunes dangling layers older than seven days. Tagged releases
remain until removed explicitly. Before removing an old tag, compare it with
both release files:

```sh
sudo cat /opt/ums-app-react/release.env
sudo cat /opt/ums-app-react/previous-release.env
sudo docker image rm \
  ghcr.io/elijahl123/ums-app-react-api:staging-<old-sha> \
  ghcr.io/elijahl123/ums-app-react-web:staging-<old-sha>
```

Never remove the active or previous release images.

Stripe webhooks use
`https://dev.untitledmanagementsoftware.com/api/billing/webhook`. Google OAuth
and Firebase redirects continue using the public HTTPS domain.
