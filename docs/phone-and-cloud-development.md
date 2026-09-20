# Phone and Cloud Development

This runbook lets the founder delegate, inspect, test, and approve Aurelian changes
without leaving a laptop online. GitHub is the source of truth; Codex cloud tasks and
GitHub Codespaces operate on GitHub branches, GitHub Actions validates pull requests,
and Vercel supplies browser-testable previews.

## System boundary

| Service | Responsibility |
| --- | --- |
| GitHub | Source of truth, branches, pull requests, review, and CI |
| Codex cloud task | Bounded implementation work on a repository branch |
| GitHub Codespaces | Interactive browser editor and terminal when needed |
| GitHub Actions | Typecheck, production build, tests, and conditional CI-database migrations |
| Vercel | Preview deployment for pull requests and production deployment after merge |
| Neon | Hosted databases, with separate development, CI, and production branches |

Neither Codex nor a Codespace depends on the founder's laptop. Work that exists only in
an unpushed laptop checkout is unavailable to cloud workers.

## One-time account setup

The repository configuration is already included in source control. The following account-
level controls must be completed by a repository or service administrator because they
change GitHub, Vercel, or Neon resources outside the codebase.

### 1. Protect the default branch

In GitHub, protect `main` and require the `build-and-test` check before merging. Require a
pull request and disable force pushes. Keep the founder as the release authority.

### 2. Connect Vercel to GitHub

Enable a Vercel preview deployment for pull requests. Production should deploy only from
the protected production branch. Store production variables in Vercel, not GitHub
Codespaces.

### 3. Create isolated Neon branches

Use separate Neon branches or projects for these scopes:

- Development: safe for interactive work from Codespaces.
- CI: disposable test target referenced by `TEST_DATABASE_URL` in GitHub Actions.
- Production: available only to the deployed application and authorized operators.

Never put the production `DATABASE_URL` in Codespaces secrets or an agent prompt.

### 4. Configure Codespaces secrets

Open GitHub **Settings → Codespaces → Secrets**, create the following secrets, and grant
them only to the Aurelian repository:

| Secret | Required | Safe value |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Development-only Neon connection string |
| `NEXTAUTH_SECRET` | Yes | Development-only random value required by the repository contract |
| `AUTH_SECRET` | Yes | Set to the same development value for the current Auth.js v5 environment alias |
| `INGEST_SECRET` | Yes | Development-only random value |
| `CRON_SECRET` | Yes | Development-only random value |
| `ANTHROPIC_API_KEY` | No | Restricted development key with a budget limit |

Add optional Sentry and SFTP values only when a specific development task requires them.
Do not reuse production ingestion, cron, carrier, gateway, or authentication secrets.

### 5. Configure Actions secrets

Add `TEST_DATABASE_URL` under the repository's **Settings → Secrets and variables →
Actions**. It must point to a dedicated CI Neon branch. The CI workflow can reset this
database, so it must never point to development or production. Until this secret exists,
CI skips database provisioning; typecheck, build, and non-database tests still run.

## Open the project from a phone or tablet

1. Open the repository on GitHub.
2. Select **Code → Codespaces → Create codespace**.
3. Wait for `npm ci --legacy-peer-deps` to finish.
4. In the browser terminal, run `npm run dev`.
5. Open the private forwarded port named **Aurelian Next.js**.

Port `3000` is private by default. Do not make it public merely to simplify phone access;
GitHub authentication protects a private forwarded port.

## Delegate a cloud coding task

Use a bounded prompt such as:

> Implement issue #42 on a new branch. Read AGENTS.md first. Do not access production,
> merge, or deploy. Run the relevant tests, push the branch, and open a draft pull request
> with the validation results and rollback notes.

Every task should identify:

- the expected behavior;
- files or domain area in scope;
- Aurelian invariants that must remain true;
- required tests or verification;
- forbidden actions, especially production writes, merging, and deployment.

## Review and release from a phone

1. Review the pull-request summary and changed files in GitHub Mobile or the browser.
2. Confirm `build-and-test` succeeds. It can also be started manually from the Actions tab.
3. Open the Vercel preview and exercise the changed behavior.
4. Ask for corrections on the same branch if anything is unclear or broken.
5. Merge only when the diff, CI evidence, preview, and rollback plan are acceptable.
6. Verify the production deployment and the affected workflow after release.

For financial, authentication, tenant-isolation, schema, policy-activation, or production
changes, phone review alone is not sufficient. Defer approval until the full diff and test
evidence can be reviewed comfortably.

## End-of-session checklist

- Commit and push incomplete work to a named branch.
- Leave a short handoff in the pull request or task.
- Stop idle Codespaces to avoid unnecessary compute charges.
- Confirm no secret was pasted into a prompt, commit, log, or pull-request description.
- Keep unrelated work on separate branches.

## Recovery

If a Codespace becomes unusable, create a new one from the pushed branch. If a cloud task
produces a poor change, close its pull request or revert its commit; never repair it by
force-pushing the protected branch. GitHub remains the recovery point.
