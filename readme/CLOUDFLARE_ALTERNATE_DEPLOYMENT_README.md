# SportyGo Alternate Cloudflare Deployment

This is an alternate deployment guide for:

```text
https://github.com/iPasmo-Technologies/sportygo-sports-app
```

It keeps Neon PostgreSQL, Stripe, and SMTP as the application services and uses Cloudflare for hosting and routing.

## Where each step is performed

| Task | Local laptop | Cloudflare dashboard | GitHub |
| --- | --- | --- | --- |
| Install dependencies and run builds | Yes | No | No |
| Run Docker image checks | Yes, with Docker Desktop | No | No |
| Run Neon migrations and seed | Yes, from `backend/`, or trusted CI | No | No |
| Create the Pages project | No | Yes | Authorize repository access |
| Configure Pages build settings | No | Yes | No |
| Configure Pages production variables | No | Yes | No |
| Create the backend Worker/Container | Initially yes with Wrangler; dashboard can manage the Worker afterward | Yes for settings, domains, logs, and secrets | No |
| Connect automatic frontend deployment | No | Yes, through Pages Git integration | Repository and branch are the source |
| Connect automatic backend deployment | No | Yes, through Workers Builds | Repository and branch are the source |
| Push code that triggers deployment | Git command from laptop or another Git client | No | Yes, after push |

Use the laptop for code validation and one-time database setup. Use the Cloudflare dashboard to connect GitHub, configure environments, add domains, manage secrets, and inspect deployments. GitHub stores the code and triggers builds; it does not store Cloudflare runtime secrets.

## Deployment architecture

| Application part | Cloudflare product | Repository path |
| --- | --- | --- |
| React/Vite frontend | Cloudflare Pages | `frontend/` |
| Express backend | Cloudflare Workers + Containers | `cloudflare/backend-worker/` |
| Database | Neon PostgreSQL | External service |
| Card payments | Stripe | External service |
| Email | SMTP provider | External service |

## Do I need Wrangler for the frontend?

No. The frontend is a standard React/Vite application and can be deployed directly to Cloudflare Pages through GitHub.

Wrangler is only required for the backend Container Worker. Do not add Wrangler to `frontend/package.json` unless you intentionally want to deploy the frontend manually from the command line.

## 1. Verify the repository

From the repository root:

```powershell
Set-Location D:\Mone\Projects\sportygo\sourcecode\sportygo-sports-app
git status
git push origin main
```

Use the branch you want Cloudflare to deploy if it is not `main`.

There is no root `package.json`. Run frontend and backend commands from their own directories.

## 2. Verify local builds

### Frontend

```powershell
Set-Location frontend
npm ci
npm run build
```

The build output is:

```text
frontend/dist/
```

### Backend

```powershell
Set-Location ../backend
npm ci
npm run build
```

The build output is:

```text
backend/dist/
```

Use Node.js `20.19+` or `22.12+` because the current Vite version requires one of those versions.

## 3. Deploy the frontend to Cloudflare Pages

**Where:** Cloudflare dashboard, with the code coming from GitHub. The local laptop is used only to run `npm run build` before connecting the repository.

1. Open the Cloudflare dashboard.
2. Go to **Workers & Pages**.
3. Select **Create application**.
4. Select **Pages -> Connect to Git**.
5. Authorize GitHub and allow access to `iPasmo-Technologies/sportygo-sports-app`.
6. Select the production branch.
7. Use these build settings:

```text
Root directory: frontend
Build command: npm run build
Build output directory: dist
```

8. Set the Node.js version to `20.19+` or a current Node.js LTS version.
9. Add the production variables below.
10. Select **Save and Deploy**.

### Pages dashboard screenshots

The dashboard labels can change over time. These official Cloudflare screenshots show the fields to look for:

![Cloudflare Pages build settings](https://developers.cloudflare.com/cdn-cgi/image/onerror=redirect,width=984,height=349,format=webp/_astro/configuration.C_N8MiKW.png)

![Cloudflare Pages root directory setting](https://developers.cloudflare.com/cdn-cgi/image/onerror=redirect,width=1023,height=322,format=webp/_astro/root-directory.CKTDgRpM.png)

Official reference: [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/).

### Pages production variables

Configure these under the Pages project production environment:

```dotenv
VITE_API_BASE_URL=https://api.example.com
VITE_AUTH_PAYLOAD_KEY=<same value used by the backend>
VITE_STRIPE_PUBLISHABLE_KEY=<Stripe publishable key>
VITE_MOCK_PAYMENT_ENABLED=false
VITE_PAYMENT_TEST_PAGE_ENABLED=false
```

Important:

- `VITE_API_BASE_URL` must be the public backend URL.
- `VITE_AUTH_PAYLOAD_KEY` must match the backend value.
- Every `VITE_*` variable is included in browser JavaScript.
- Never place `DATABASE_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, SMTP passwords, or `PASSWORD_AT_REST_KEY` in Pages variables.

The current frontend uses internal screen state rather than URL-based routing, so an `_redirects` file is not required.

### Optional frontend custom domain

In the Pages project, open **Custom domains -> Set up a domain** and add a hostname such as:

```text
app.example.com
```

Use this URL for backend CORS configuration.

## 4. Deploy the backend Container Worker

**Where:** Start on the local laptop with Docker and Wrangler. After the first successful deployment, use the Cloudflare dashboard and Workers Builds to connect GitHub for automatic production deployments.

The repository already contains the backend adapter:

```text
cloudflare/backend-worker/
  src/index.ts
  wrangler.jsonc
  package.json
```

It forwards requests to the existing Express application, built from `Dockerfile.backend`, on port `3001`.

### Requirements

- Docker Desktop must be running for a local Dockerfile deployment.
- Cloudflare Workers Paid is required for Containers.
- The adapter uses `@cloudflare/containers` and Wrangler.

Install the adapter dependencies:

```powershell
Set-Location cloudflare/backend-worker
npm ci
```

### Backend configuration

The adapter already defines these non-secret values:

```dotenv
NODE_ENV=production
PORT=3001
DATABASE_SSL=true
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_POOL_MAX=10
STRIPE_CURRENCY=sgd
```

Configure the frontend origin as a production variable:

```dotenv
FRONTEND_URL=https://app.example.com
FRONTEND_URLS=https://app.example.com
```

### Backend secrets

From `cloudflare/backend-worker/`, add the following secrets:

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

Wrangler prompts for each value. Never commit these values to Git.

| Secret | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `VITE_AUTH_PAYLOAD_KEY` | Must match the Pages variable |
| `PASSWORD_AT_REST_KEY` | Encrypts passwords stored in the database |
| `STRIPE_SECRET_KEY` | Server-side Stripe access |
| `SMTP_*` | Password-reset and booking-confirmation email |

### Test the backend image locally

From the repository root:

```powershell
Set-Location D:\Mone\Projects\sportygo\sourcecode\sportygo-sports-app
docker info
docker build -f Dockerfile.backend -t sportygo-backend:local .
```

### Deploy with Wrangler

```powershell
Set-Location cloudflare/backend-worker
npx wrangler login
npx wrangler deploy
npx wrangler containers list
```

The first Container deployment can take several minutes while Cloudflare provisions the image.

### Secret updates and stale Container instances

A dashboard or `wrangler secret put DATABASE_URL` update deploys a new Worker version, but a secret-only change may not produce an effective Container configuration change. Existing Container processes can therefore continue using their old startup environment. In this project, the backend creates its PostgreSQL pool once at startup, and active traffic can continually reset the Container's 10-minute idle shutdown timer.

Verify the Worker secret and deployment without printing secret values:

```powershell
Set-Location cloudflare/backend-worker
npx wrangler secret list
npx wrangler deployments list
npx wrangler containers list
```

If the Worker deployment is newer than the Container application's **Last modified** time, replace the old instances instead of waiting for a busy instance to sleep:

1. Change the `LABEL rebuild` value in `Dockerfile.backend` to a unique value such as `YYYY-MM-DD-database-url-rotation`.
2. Commit and push the change to `main`, or perform a manual immediate rollout from the repository root:

  ```powershell
  npx wrangler deploy --containers-rollout=immediate --config cloudflare/backend-worker/wrangler.jsonc
  ```

3. Find the Container application ID and inspect replacement instances:

  ```powershell
  npx wrangler containers list --config cloudflare/backend-worker/wrangler.jsonc
  npx wrangler containers instances <CONTAINER_APPLICATION_ID> --config cloudflare/backend-worker/wrangler.jsonc
  ```

4. Wait for a new **Last modified** time and healthy replacement instances, then test a database-backed API operation against known production data.

Cloudflare sends `SIGTERM` to old processes during the rollout and starts replacements with the current secret values. Do not use `wrangler containers delete` to refresh instances because that deletes the Container application. In a quiet non-production environment, stopping traffic and waiting more than 10 minutes also allows the default idle lifecycle to stop the process, but this is not deterministic for production.

The new database must already contain the required schema and application-user permissions. Editing `backend/.env` changes local execution only; it does not update Cloudflare runtime secrets.

### Connect backend deployment to GitHub

After the command-line deployment succeeds:

1. Open **Workers & Pages**.
2. Select the backend Worker.
3. Open **Settings -> Builds -> Connect**.
4. Select the same GitHub repository.
5. Use these production build settings:

```text
Build command: None (leave blank)
Deploy command: npx wrangler deploy
Root directory: cloudflare/backend-worker
Production branch: main
```

6. Select **Create new token** and keep the automatically generated Workers Builds API token. A descriptive name such as `SportyGo Backend Workers Builds` is sufficient.
7. Leave build-time variable name and value fields blank. Configure backend credentials separately under the Worker's runtime **Settings -> Variables and Secrets**.
8. Disable **Builds for non-production branches**. The default version command can remain as shown:

```text
npx wrangler versions upload
```

It will not run while non-production builds are disabled. Container previews should remain disabled because `wrangler versions upload` does not publish an updated Container image and Durable Object/Container Workers do not receive a normal preview URL.

9. Keep the default build watch paths for the initial deployment:

```text
Include paths: *
Exclude paths: node_modules/**, .git/
```

This safely triggers the backend build for every repository change. To avoid unrelated builds later, narrow the includes to `cloudflare/backend-worker/*`, `backend/*`, and `Dockerfile.backend`.

10. Push a commit to `main` and monitor the first production build.

Container production builds must use `wrangler deploy`; it bundles the Worker, builds and publishes the image, and rolls out the Container instances. A separate build command is not required.

### Backend dashboard and GitHub screenshots

Cloudflare’s current Workers Builds flow is dashboard-driven: choose **Workers & Pages -> Create application -> Import a repository**, or open an existing Worker and choose **Settings -> Builds -> Connect**. The repository must contain the adapter directory and `wrangler.jsonc`.

Official reference: [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

The Container dashboard is used after deployment to check status, metrics, and logs:

```text
Workers & Pages -> Containers
```

Official reference: [Cloudflare Containers dashboard and deployment](https://developers.cloudflare.com/containers/deploy/).

## 5. Configure the API domain

**Where:** Cloudflare dashboard. The API hostname is configured after the Worker is deployed; then the frontend variable is changed in Pages and Pages is redeployed.

Add a custom domain to the backend Worker, for example:

```text
api.example.com
```

Verify:

```text
https://api.example.com/api/health
```

The response should contain:

```json
{
  "status": "ok"
}
```

For a Pages custom domain, use **Pages project -> Custom domains -> Set up a domain**. The official screenshot below shows the custom-domain setup area:

![Cloudflare Pages custom domain setup](https://developers.cloudflare.com/cdn-cgi/image/onerror=redirect,width=1401,height=410,format=webp/_astro/domains.zq2MU_IJ.png)

Official reference: [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).

Then set the Pages variable:

```dotenv
VITE_API_BASE_URL=https://api.example.com
```

Redeploy Pages after changing this value.

Set the backend CORS values to the final frontend URL and redeploy the backend:

```dotenv
FRONTEND_URL=https://app.example.com
FRONTEND_URLS=https://app.example.com
```

## 6. Initialize Neon PostgreSQL

Run once against the production Neon database:

```powershell
Set-Location backend
npm ci
npm run db:migrate
npm run db:seed
```

The seed loads sports, events, facilities, packages, and slot configuration.

Do not run this destructive command against production:

```powershell
npm run db:reset:seed
```

## 7. Final verification

- Pages frontend loads successfully.
- Images and CSS load.
- Frontend requests use `https://api.example.com`.
- `/api/health` returns `status: "ok"`.
- Neon is reachable from the backend.
- CORS allows the production frontend origin.
- Registration assigns the `public` role.
- Email and mobile login work.
- Duplicate mobile numbers show the email-login message.
- Pickleball indoor court displays S$30/hour.
- Pickleball outdoor court displays S$25/hour.
- Booking, Stripe, password reset, email, profile, and booking history flows work.

## Required services

- Cloudflare Pages
- Cloudflare Workers + Containers
- Workers Paid plan for Containers
- Neon PostgreSQL
- Stripe
- SMTP provider

D1, KV, R2, Hyperdrive, Queues, Workflows, Workers AI, Vectorize, Turnstile, and Pages Functions are not required for the initial deployment.
