# SportyGo Cloudflare Deployment Guide

This guide is for the repository:

- GitHub: https://github.com/iPasmo-Technologies/sportygo-sports-app
- Frontend: React 18 + TypeScript + Vite
- Backend: Express 4 + TypeScript + Node.js
- Database: Neon PostgreSQL
- Payments: Stripe
- Email: SMTP via Nodemailer

The recommended production layout is:

```text
Browser
  |
  +--> Cloudflare Pages: frontend/dist
  |
  +--> Cloudflare Worker + Container: Express API
                                      |
                                      +--> Neon PostgreSQL
                                      +--> Stripe
                                      +--> SMTP provider
```

## 1. Recommendation

Use **Cloudflare Pages for the frontend** and **Cloudflare Containers behind a Worker for the backend**. Keep Neon as the PostgreSQL provider.

This gives one Cloudflare account, Cloudflare DNS/custom domains, Git-based deployments, and edge routing while avoiding a database rewrite. Cloudflare does not provide a drop-in managed PostgreSQL database for this application, so Neon remains the database of record.

### Important backend compatibility note

The existing backend is a normal long-running Express server started by `app.listen()` in `backend/src/index.ts`. It runs inside the repository's Cloudflare Container adapter, but Cloudflare Containers is not a generic Docker hosting dashboard. It requires:

1. A Worker entrypoint that routes requests to a Container class.
2. A Wrangler configuration with the Container and Durable Object bindings.
3. The `@cloudflare/containers` package in the Worker adapter project.
4. A container image that listens on the configured port.

The repository now includes the required adapter under `cloudflare/backend-worker/`. Do not deploy the Dockerfile through a Pages project or assume that a direct Dockerfile upload creates a public API.

## 2. GitHub: connect or import?

Choose **Connect to Git** for the Cloudflare Pages frontend and **Import a repository** under Workers Builds for the backend Worker.

For this repository, this is better than Direct Upload or a manual Git import because:

- pushes to the production branch can deploy automatically;
- pull requests can receive frontend preview deployments;
- the repository remains the single source of truth;
- Cloudflare can build the frontend and the Worker from the monorepo;
- rollback is tied to a known commit.

Use the organization repository, not the old repository name:

```text
iPasmo-Technologies/sportygo-sports-app
```

The GitHub account used to authorize Cloudflare must have access to that organization repository. If Cloudflare cannot see the repository, sign into the GitHub organization owner account, verify the repository exists, and approve the Cloudflare GitHub App for the `iPasmo-Technologies` organization/repository.

Cloudflare Pages and Workers Builds are separate connections. Authorizing Pages does not automatically authorize Workers Builds.

## 3. What is required now, and what is optional?

### Required

| Service or setting | Why it is required |
| --- | --- |
| Cloudflare Pages | Hosts the compiled Vite frontend globally. |
| Cloudflare Worker + Container | Runs the existing Express backend without rewriting it for the Workers runtime. |
| Workers Paid plan | Cloudflare Containers are available on the Workers Paid plan. |
| Neon PostgreSQL | Stores users, sports, facilities, slots, reservations, bookings, and system configuration. |
| Stripe account and keys | Required for card payment flows. |
| SMTP provider | Required for password-reset and booking-confirmation email. |
| GitHub repository access | Required for Git-based continuous deployment. |

### Recommended but not required on day one

| Service | When to use it |
| --- | --- |
| Hyperdrive | Add when the API is deployed in Cloudflare Workers/Containers and database connection latency or connection churn becomes measurable. It supports Neon and can provide connection pooling close to Cloudflare. |
| Cloudflare custom domains and DNS | Use `app.example.com` and `api.example.com` instead of `pages.dev` and `workers.dev`. |
| Workers Logs/Observability | Enable for production troubleshooting and request visibility. |
| Cloudflare Web Analytics | Add lightweight frontend traffic/performance analytics. |
| Turnstile | Add later if public authentication or booking endpoints attract automated abuse. |
| WAF/API Shield | Consider when the application has meaningful public traffic or needs stricter API controls. |

### Not required for this application

Do not add D1, KV, R2, Durable Objects for application data, Queues, Workflows, Workers AI, Vectorize, or Cloudflare Email Routing merely to deploy this project. The current code already uses Neon, PostgreSQL transactions/locks, Stripe, and SMTP. Adding Cloudflare storage would create a second data model and is not needed.

## 4. Repository deployment map

| Component | Location | Build/start behavior |
| --- | --- | --- |
| Frontend | `frontend/` | `npm run build` produces `frontend/dist` |
| Backend | `backend/` | Run `npm run build` inside this directory; it produces `backend/dist/` |
| Backend image | `Dockerfile.backend` | Builds Node 20 Alpine image and runs `node dist/index.js` |
| Local frontend proxy | `frontend/vite.config.ts` | `/api` proxies to `http://localhost:3001` only in development |
| Local full stack | `docker-compose.yml` | Frontend on `8080`, backend on `3001` |
| Database migration | `backend/src/scripts/migrate.ts` | Creates/updates schema |
| Database seed | `backend/src/scripts/seed.ts` | Seeds packages, sports, events, facilities, and slot configuration |

The production frontend must set `VITE_API_BASE_URL` to the public API URL. The Vite development proxy is not present in the deployed static site.

## 5. Before deploying

### 5.1 Push and verify the repository

From the repository root:

```powershell
git remote -v
git status
git push origin main
```

Confirm that the target branch is actually named `main`; otherwise use the real production branch in Cloudflare.

### 5.2 Run the local builds

There is no root `package.json`, so run each build in its own directory:

```powershell
Set-Location frontend
npm ci
npm run build

Set-Location ../backend
npm ci
npm run build
```

Expected outputs:

- `frontend/dist/`
- `backend/dist/`

### 5.3 Check production security prerequisites

- Do not commit `.env`, `.env.local`, database URLs, Stripe secret keys, SMTP passwords, JWT secrets, or password-encryption keys.
- Use different secrets for local, staging, and production.
- Use Stripe live keys only for the production environment.
- Use a strong random `JWT_SECRET` and a separate `PASSWORD_AT_REST_KEY`.
- Set `NODE_ENV=production`; this disables the development reset route.
- Keep `DEV_RESET_TOKEN` unset or set it to an unusable value in production.
- Restrict CORS to the final frontend origin.

## 6. Deploy the frontend to Cloudflare Pages

### Dashboard steps

1. Sign in to the Cloudflare account that will own the deployment.
2. Open **Workers & Pages**.
3. Select **Create application**, then **Pages**, then **Connect to Git**.
4. Authorize GitHub and grant access to the `iPasmo-Technologies/sportygo-sports-app` repository.
5. Select the repository.
6. Set the production branch to `main` or the branch used by the project.
7. Under the advanced build settings, set:

```text
Root directory: frontend
Build command: npm run build
Build output directory: dist
```

8. Use Node.js 20 for the build if a Node version setting is available. The project Dockerfiles also use Node 20.
9. Add these Pages environment variables for the **Production** environment:

```dotenv
VITE_API_BASE_URL=https://api.example.com
VITE_AUTH_PAYLOAD_KEY=<same-value-used-by-backend>
VITE_STRIPE_PUBLISHABLE_KEY=<Stripe-live-publishable-key>
VITE_MOCK_PAYMENT_ENABLED=false
VITE_PAYMENT_TEST_PAGE_ENABLED=false
```

`VITE_*` values are compiled into browser JavaScript. `VITE_AUTH_PAYLOAD_KEY` is not a server secret in this design, but it must match the backend value. Never put `DATABASE_URL`, `STRIPE_SECRET_KEY`, `SMTP_PASS`, `JWT_SECRET`, or `PASSWORD_AT_REST_KEY` in Pages.

10. Select **Save and Deploy**.
11. Open the generated `*.pages.dev` URL and confirm that the frontend loads.

### Custom frontend domain

In the Pages project, open **Custom domains**, select **Set up a domain**, and add the chosen app hostname, for example:

```text
app.example.com
```

Use the resulting final URL as `FRONTEND_URL` in the backend and as the browser origin allowed by CORS.

## 7. Deploy the backend with Cloudflare Containers

### Why the adapter is needed

Cloudflare Containers runs an image through a Worker. The repository includes the Express app, image, and Worker adapter under `cloudflare/backend-worker/`:

```text
cloudflare/backend-worker/
  src/index.ts
  wrangler.jsonc
  package.json
```

The adapter contains:

- extend `Container` from `@cloudflare/containers`;
- set `defaultPort = 3001`;
- route incoming requests to a named Container instance;
- pass production environment variables to the container;
- reference `../../Dockerfile.backend` or a registry image;
- define the required Durable Object migration and binding.

The adapter is intentionally small. The Express routes, Neon queries, Stripe integration, and Nodemailer code remain inside the container, while the Worker selects the named Container instance and forwards requests.

### Create the adapter

From the repository root, scaffold using the current Cloudflare template or create the adapter package manually:

```powershell
npm create cloudflare@latest -- --template=cloudflare/templates/containers-template
```

Place the generated Worker project in a dedicated directory and adapt its Container class to the SportyGo image. Install the required package in that Worker project:

```powershell
npm install @cloudflare/containers
npm install -D wrangler typescript @cloudflare/workers-types
```

The existing backend dependencies do not need to be installed in the Worker adapter. They are installed by `Dockerfile.backend` inside the container.

### Container requirements

The image must:

- build for `linux/amd64`;
- listen on port `3001`;
- start `node dist/index.js`;
- have outbound internet access for Neon, Stripe, and SMTP;
- receive all required backend environment variables at runtime;
- not rely on local filesystem persistence;
- not assume a fixed localhost hostname.

The current backend uses Neon for persistence, so it does not need a local volume.

### Deploy from the machine first

Docker must be running when Wrangler builds a Dockerfile-based image locally:

```powershell
docker info
Set-Location cloudflare/backend-worker
npx wrangler login
npx wrangler deploy
npx wrangler containers list
```

The first deployment can take several minutes while Cloudflare provisions the Worker and container image. Check the Worker URL and the Containers dashboard after deployment.

### Connect the backend Worker to GitHub

After the adapter works from the machine:

1. Open **Workers & Pages** and select the backend Worker.
2. Open **Settings** -> **Builds** -> **Connect**.
3. Select GitHub and the `iPasmo-Technologies/sportygo-sports-app` repository.
4. Use these production build settings:

```text
Build command: None (leave blank)
Deploy command: npx wrangler deploy
Root directory: cloudflare/backend-worker
Production branch: main
```

5. Select **Create new token** and keep the automatically generated Workers Builds API token. A descriptive name such as `SportyGo Backend Workers Builds` is sufficient.
6. Leave build-time variable name and value fields blank. Backend credentials belong in the Worker's runtime **Settings** -> **Variables and Secrets**, not in Workers Builds.
7. Disable **Builds for non-production branches**. The displayed default version command, `npx wrangler versions upload`, can remain unchanged because it will not run while non-production builds are disabled.
8. Keep the default build watch paths to deploy for any repository change:

```text
Include paths: *
Exclude paths: node_modules/**, .git/
```

The broad `*` include is safe for the initial deployment, although frontend-only and documentation changes will also trigger a backend build. It can be narrowed later to `cloudflare/backend-worker/*`, `backend/*`, and `Dockerfile.backend` if unnecessary builds become a concern.

9. Push a commit to `main` and monitor the first build.

For Container Workers, production must use `wrangler deploy`, because it publishes the image and rolls out container instances. A preview `wrangler versions upload` does not update the container image and does not provide a normal full-app preview URL.

## 8. Backend production variables and secrets

Configure these in the backend Container/Worker runtime. Keep sensitive values as Cloudflare secrets, not committed Wrangler variables.

### Public or non-secret configuration

```dotenv
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://app.example.com
FRONTEND_URLS=https://app.example.com
DATABASE_SSL=true
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_POOL_MAX=10
STRIPE_CURRENCY=sgd
```

### Required secrets

```text
DATABASE_URL                 Neon production connection string
JWT_SECRET                   Long random JWT signing secret
VITE_AUTH_PAYLOAD_KEY        Must equal the Pages value
PASSWORD_AT_REST_KEY         Separate encryption key for stored passwords
STRIPE_SECRET_KEY            Stripe live secret key
SMTP_HOST                    SMTP server hostname
SMTP_PORT                    465 for implicit TLS or 587 for STARTTLS
SMTP_USER                    SMTP username
SMTP_PASS                    SMTP password/API credential
SMTP_FROM                    Verified sender address
```

For the current SMTP provider, use the provider’s verified production values. Do not copy credentials from the local `backend/.env` into the repository or documentation. The backend selects implicit TLS automatically when `SMTP_PORT=465`.

Add secrets from the Worker dashboard under **Settings** -> **Variables and Secrets**, or with Wrangler:

```powershell
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
npx wrangler secret put VITE_AUTH_PAYLOAD_KEY
npx wrangler secret put PASSWORD_AT_REST_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put SMTP_HOST
npx wrangler secret put SMTP_PORT
npx wrangler secret put SMTP_USER
npx wrangler secret put SMTP_PASS
npx wrangler secret put SMTP_FROM
```

If the Container adapter passes secrets through `envVars`, ensure the Worker configuration does so securely and verify the current Containers secret/environment-variable mechanism before production. Never print secret values in build logs.

### Rotating `DATABASE_URL` and other Container secrets

Changing a secret in **Worker Settings -> Variables and Secrets** deploys a new Worker version, but it does not necessarily restart existing Container instances. This distinction matters for this backend:

- The Worker reads `env.DATABASE_URL` and passes it through the Container class `envVars` field.
- A Container receives those environment variables when its process starts.
- The Express backend reads `process.env.DATABASE_URL` once at module startup and creates a long-lived PostgreSQL pool.
- The named `api` Container uses `sleepAfter = '10m'`. Incoming requests reset that idle timer, so a busy instance may continue running indefinitely with its previous database connection pool.

Consequently, a successful secret-only deployment can leave the API connected to the old database. Waiting is sufficient only if every old instance becomes idle for at least 10 minutes and restarts. After an actual restart, allow approximately 1-5 minutes for the replacement instance to become healthy. For production changes, explicitly roll out replacement instances instead of relying on the idle timer.

#### Verify the secret deployment without exposing its value

Run these commands from `cloudflare/backend-worker/`:

```powershell
npx wrangler secret list
npx wrangler deployments list
npx wrangler containers list
```

Confirm all of the following:

1. `DATABASE_URL` appears in `secret list` as `secret_text`.
2. The latest Worker deployment message records the secret update.
3. The Container application's **Last modified** time is later than the secret update.

`wrangler secret list` shows names and types only; Cloudflare does not reveal stored secret values. If the Worker deployment is newer than the Container application's **Last modified** time, the Worker has the new secret but live Container processes may still have the old value.

#### Bring down old Container instances with a forced rollout

The preferred production procedure is to replace old instances through a Container rollout. Do not delete the Container application; deletion removes the application rather than safely refreshing its running processes.

1. Update the cache-bust label in `Dockerfile.backend` to a new unique value:

  ```dockerfile
  LABEL rebuild="YYYY-MM-DD-database-url-rotation"
  ```

2. Commit and push the label change to the configured production branch, currently `main`. Workers Builds must use `npx wrangler deploy`, not `npx wrangler versions upload`.
3. For the shortest replacement window, deploy manually from the repository root with an immediate rollout:

  ```powershell
  npx wrangler deploy --containers-rollout=immediate --config cloudflare/backend-worker/wrangler.jsonc
  ```

  The changed image label produces a new image digest. `--containers-rollout=immediate` targets 100% of old instances for replacement in one rollout step. Cloudflare sends `SIGTERM`, drains each selected process, and starts a replacement with the current Worker secrets.

4. Monitor the application and its instances:

  ```powershell
  npx wrangler containers list --config cloudflare/backend-worker/wrangler.jsonc
  npx wrangler containers instances <CONTAINER_APPLICATION_ID> --config cloudflare/backend-worker/wrangler.jsonc
  ```

5. Wait until the application shows a new **Last modified** time and replacement instances are healthy. This normally takes several minutes, but deployment completion means the rollout started; it does not guarantee that every replacement has finished.
6. Send a request that reaches the database and verify known production-only data. `GET /api/health` proves that the API responds, but a database-backed operation is required to confirm the target database changed.

An alternative for a quiet non-production environment is to stop all traffic and wait longer than `sleepAfter` (currently 10 minutes). The default `onActivityExpired()` behavior stops an idle process, and its next request starts it with current secrets. This is less deterministic and is not the recommended production procedure.

Do not add an unauthenticated HTTP endpoint that calls the Container `stop()` or `destroy()` methods. If explicit per-instance lifecycle control is ever added, protect it with administrator authentication and a separate operational secret.

Official references:

- [Cloudflare Containers environment variables and secrets](https://developers.cloudflare.com/containers/examples/env-vars-and-secrets/)
- [Cloudflare Container rollouts](https://developers.cloudflare.com/containers/configuration/rollouts/)
- [Cloudflare Container interface: start and stop](https://developers.cloudflare.com/containers/reference/container-class/#start-and-stop)

#### Database readiness after switching URLs

Updating `DATABASE_URL` does not migrate or seed the new database. Before switching production traffic, run the required migration against the new connection string from a trusted machine or CI job, then verify permissions for the application database user. Keep local `backend/.env` values separate from Cloudflare runtime secrets; editing the local file does not update a deployed Worker or Container.

## 9. Neon PostgreSQL setup

1. Sign in to Neon and create or select the production project.
2. Create a production branch/database if your Neon plan uses branches.
3. Copy the pooled or direct production connection string supplied by Neon.
4. Keep SSL enabled. The existing backend sets `ssl: { rejectUnauthorized: false }` when `DATABASE_SSL=true`.
5. Add the connection string as the backend `DATABASE_URL` secret.
6. Allow the backend to connect and verify `GET /api/health`.

### Initialize the production schema

Run migrations and seeding once against the production database from a trusted machine or CI job. Do not run the destructive reset command in production.

```powershell
Set-Location backend
npm ci
npm run db:migrate
npm run db:seed
```

The seed imports the backend JSON data, including the current pickleball prices. Existing database rows are updated by the seed upsert logic, so run `db:seed` after catalog changes. Do not use `npm run db:reset:seed` against production because it deletes application data.

### Optional Hyperdrive

Hyperdrive is optional. It supports Neon and can improve connection setup for Worker-based access, but the current Express process runs inside a full Node container and already uses `pg.Pool`. Start without Hyperdrive; measure first. Add it only after confirming the chosen Container/Worker architecture and testing the `pg` connection path with Hyperdrive’s connection string. Do not add Hyperdrive to the frontend.

## 10. API custom domain and CORS

Assign a custom domain to the backend Worker, for example:

```text
api.example.com
```

Then set:

```dotenv
FRONTEND_URL=https://app.example.com
FRONTEND_URLS=https://app.example.com
```

Build the frontend with:

```dotenv
VITE_API_BASE_URL=https://api.example.com
```

Deploy the backend before the frontend if the frontend points to a new API hostname. The backend currently permits requests only from the configured origins and exposes the API under `/api`.

## 11. Verification checklist

### Infrastructure

- `https://app.example.com` loads the Vite app.
- `https://api.example.com/api/health` returns JSON with `status: "ok"`.
- Cloudflare Container status is healthy.
- Neon accepts a connection from the backend.

### Application flows

- Register a new account; it receives the default `public` role.
- Login with email and password.
- Login with mobile and password, including the duplicate-mobile fallback message.
- Browse sports, events, and facilities.
- Confirm pickleball indoor/outdoor prices are S$30/S$25 per hour.
- Load slot availability and create a booking.
- Complete a Stripe test/live payment in the intended mode.
- Receive booking confirmation email.
- Request and complete password reset email flow.
- View bookings and profile.

### Security

- A request from an unapproved browser origin is rejected by CORS.
- `/api/dev/reset-seed` is unavailable in production.
- Stripe secret, Neon URL, SMTP password, JWT secret, and password-at-rest key are not present in frontend assets or Git history.
- Pages production variables use live values and test-only UI flags are disabled.

## 12. Pricing and value for this project

Cloudflare’s current Workers Paid plan has a minimum account charge of **USD 5/month** and includes Workers usage allocations. Containers have separate usage dimensions after included allocations. Static Pages asset requests are free and unlimited; Pages Functions, if used, are billed as Workers. Neon and Stripe remain separate provider costs, and SMTP cost depends on the chosen email provider.

Do not promise a fixed monthly total without measuring traffic, container runtime, Neon usage, Stripe volume, and email volume. For a small application, the Cloudflare base plan may be the dominant Cloudflare cost, but the actual bill depends on container memory/CPU runtime and egress. Set billing alerts and review Cloudflare and Neon usage after the first month.

References:

- Cloudflare Pages Git integration: https://developers.cloudflare.com/pages/get-started/git-integration/
- Cloudflare Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
- Cloudflare Containers getting started: https://developers.cloudflare.com/containers/get-started/
- Cloudflare Containers deployment: https://developers.cloudflare.com/containers/deploy/
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Hyperdrive: https://developers.cloudflare.com/hyperdrive/
- Cloudflare Pages custom domains: https://developers.cloudflare.com/pages/configuration/custom-domains/
- Neon Cloudflare guide: https://neon.com/docs/guides/cloudflare-workers

## 13. Recommended rollout order

1. Push the repository to `iPasmo-Technologies/sportygo-sports-app`.
2. Deploy the frontend to Pages using `frontend/` and verify the static build.
3. Create and test the Cloudflare backend Worker + Container adapter locally.
4. Configure backend secrets and the Neon production database.
5. Run `db:migrate` and `db:seed` once against production.
6. Deploy the backend Worker and verify `/api/health`.
7. Add `api.example.com`, update `VITE_API_BASE_URL`, and redeploy Pages.
8. Add `app.example.com`, update backend CORS, and redeploy the backend.
9. Run the complete application verification checklist.
10. Connect both Cloudflare projects to GitHub for automatic production deployments.

This order keeps the database external and stable, makes the frontend independently verifiable, and limits the Cloudflare-specific code to the backend deployment adapter.
