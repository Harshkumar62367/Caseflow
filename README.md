# Caseflow Next: Test Hub comparison target

Caseflow Next is an independent **Next.js 16.4.1** support app with a React UI and Next.js API route handlers on the same port. It exists to compare SolidX Test Hub with other UI, API, and source-based testing tools against one consistent target. It is separate from the original plain-Node Caseflow app.

## Run locally

```bash
cd /Users/harshkumar/Documents/Codex/caseflow-next
npm ci
npm run build
npm run start
```

UI: `http://127.0.0.1:3402`  
API base: `http://127.0.0.1:3402`  
Health: `http://127.0.0.1:3402/api/health`

The app uses port **3402** so the original Caseflow server can remain on 3400. For Test Hub's New application form choose **Mixed**, **Non-SolidX**, and enter the 3402 origin in both URL fields. Test Hub's browser/worker must run on the same computer or have a tunnel to the local app.

Demo accounts: `agent@caseflow.test` and `manager@caseflow.test`, both with password `demo123`. Only the manager can access report data. These are sample credentials for a local benchmark.

Tickets and sessions are stored in `.caseflow/caseflow.sqlite`, seeded with eight tickets the first time the app starts. They survive navigation, refreshes and server restarts. Sessions expire after seven days; signing out revokes the session immediately. The database is ignored by Git. Use Node.js 22.13 or newer (the laptop uses 22.22.3); storage uses Node's built-in SQLite support.

While the server is running, `npm run reset` restores the eight sample tickets and signs out every session. `CASEFLOW_DATA_FILE` can select a separate SQLite file for an isolated recording or automated test. Automated checks use separate test databases rather than modifying recording data.

The local reset key defaults to `local-demo-reset`; set `BENCHMARK_RESET_KEY` for both the server and reset script if changing it.

## Deploy on Vercel

Set the server-only `CASEFLOW_DATABASE_URL` environment variable to a shared PostgreSQL database. The app uses PostgreSQL whenever that variable is present and keeps the SQLite backend for local recording without it. On Vercel it refuses to fall back to a local file, which would lose sessions between instances.

Provision the two tables in [database/schema.sql](database/schema.sql), seed them with `seedTickets()` from `lib/data.mjs`, and use a dedicated database login restricted to the `caseflow_demo` schema. Use the provider's transaction pooler with TLS certificate verification for serverless deployments. Keep this URL out of browser variables, source code, and Git.

Set a random `BENCHMARK_RESET_KEY` in Vercel if remote resets are needed; the reset endpoint is disabled on Vercel when it is unset. Both variables require redeployment after setting them. `/api/health` checks storage connectivity and returns the selected backend, without exposing credentials or records.

To check the PostgreSQL backend locally, point `CASEFLOW_TEST_DATABASE_URL` at a fresh, isolated PostgreSQL database named `caseflow_test` on localhost and run `npm run test:postgres`. The check covers concurrent creation and edits, comments, session reads from another process, invalid tokens, and logout.

## Pull request checks

The [GitHub Actions workflow](.github/workflows/pr-checks.yml) runs for every pull request and on manual dispatch. It installs dependencies, builds the Next.js app, runs API contract tests, starts the built app, runs Chromium UI tests, and uploads browser traces/screenshots when a check fails. This makes **Caseflow's own test suite** run on PRs. Test Hub's PR scan is a separate integration: after this repository is pushed to GitHub, connect that repository in Test Hub's Git Accounts and Application Source settings, then configure its PR scan there.

The Git remote is `https://github.com/Harshkumar62367/Caseflow.git`. Push the workflow to activate repository checks.

GitHub must see this workflow on the target branch before opening a PR. The workflow's browser runs against a Next.js server started inside the GitHub runner, so it does not depend on your laptop. A Test Hub process running only on your laptop cannot reach that runner's `localhost`; its own PR-triggered execution needs a reachable target, tunnel, or runner strategy.

## Benchmark protocol

- Shared workflows: [benchmark/scenarios.md](benchmark/scenarios.md)
- Controlled defect ground truth: [benchmark/oracle.md](benchmark/oracle.md). Keep this hidden from tools during black-box authoring.
- Result sheet: [benchmark/scorecard.csv](benchmark/scorecard.csv)

The correct default is `baseline`. To run a known defect, stop the app and start one variant, for example:

```bash
BENCHMARK_VARIANT=workflow npm run start
```

Variants: `validation`, `authorization`, `filter`, `workflow`, `a11y`. `UI_COPY_VARIANT=refreshed` changes the visible New ticket label to Add request for maintenance comparisons. Run one product at a time and reset before every run. For cloud browsers, configure that provider's tunnel or host the app; remote `localhost` is not this laptop.

## Local checks

```bash
npm run build
npm test
npm run test:e2e
```

If Chromium is not installed locally, run `npx playwright install chromium` first. CI installs it automatically.
