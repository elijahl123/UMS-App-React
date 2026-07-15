# Release Flow

This project uses `staging` as the integration branch and `main` as the production branch.

The goal is to keep the deployed environments predictable:

```text
feature branch
  -> pull request into staging
  -> staging deploys to dev.untitledmanagementsoftware.com
  -> test and verify staging
  -> pull request from staging into main
  -> production deploys to app.untitledmanagementsoftware.com
  -> keep staging aligned with main
```

## Branch Roles

- `staging`: collects completed feature work and deploys to the staging environment.
- `main`: production source of truth and deploys to the production environment.
- Feature branches: short-lived branches created from `staging`.

Avoid using `master` in this flow. If `main` is the production branch, keep `master` out of pull requests and deploys.

## Day-to-Day Work

Start feature work from the latest `staging` branch:

```powershell
git fetch origin
git switch staging
git pull origin staging
git switch -c feature/my-change
```

Open pull requests from feature branches into `staging`:

```text
feature/my-change -> staging
```

Merging feature branches into `staging` may use squash merges. This keeps the integration branch readable while staging still receives the final tested file changes.

## Promoting Staging to Production

After staging has been tested, open a pull request from `staging` into `main`:

```text
staging -> main
```

Merge this pull request with a normal merge commit. Do not squash merge `staging` into `main`.

Squashing `staging` into `main` gives production the same files but different commit history. After that, GitHub can show old staging commits again in future pull requests, even when the file contents already match.

## GitHub Merge Settings

Recommended merge rules:

- Feature branch into `staging`: squash merge is okay.
- `staging` into `main`: create a merge commit.
- Direct pushes to `main`: disabled.
- Pull request required for `main`: enabled.
- Required status checks for `main`: enabled.
- Require branches to be up to date before merging to `main`: enabled.

## Syncing After Production

After the `staging -> main` pull request is merged, update your local branches:

```powershell
git fetch origin
git switch main
git pull origin main

git switch staging
git pull origin staging
```

If a `staging -> main` pull request is accidentally squash-merged, reset `staging` back to `main` after production is confirmed:

```powershell
git fetch origin
git switch staging
git reset --hard origin/main
git push --force-with-lease origin staging
```

Only use that reset when `staging` should exactly match production. If new unpromoted work has already landed on `staging`, move that work to a new feature branch before resetting.

## Quick Rule

Squash feature branches into `staging`; merge `staging` into `main` with a normal merge commit.
