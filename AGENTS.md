# Working in this repository

## Branching and pull requests

`main` is production and `staging` is the integration branch. Work never goes
straight to `main`.

1. Branch off `staging` and build the change there.
2. Open a pull request **into `staging`**. This is the review PR: it carries the
   description of the change, and it is the one reviewers comment on.
3. Promote with a second pull request **from `staging` into `main`**. This is the
   release PR; it collects whatever has accumulated on `staging` since the last
   promotion. Keep one open and let it fill up rather than opening a new one per
   change.

Never retarget a feature PR at `main` to skip the promotion step, and never push
directly to `staging` or `main`.

CI already assumes this shape:

- `ci.yml` (lint, test, build) runs on pull requests to both `main` and `staging`.
- `playwright.yml` runs only on pull requests to `main`, so end-to-end coverage
  arrives at the promotion PR, not the feature PR. Don't treat a green feature PR
  as proof the e2e suite passes.
- A push to `staging` deploys staging; a push to `main` deploys production.

If a feature branch was cut from `main` by mistake, rebase it onto `staging`
before opening the PR — the two branches carry the same tree after a promotion,
so the rebase drops the already-promoted commits cleanly.
