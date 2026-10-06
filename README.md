# sg-booking-app

Production-ready booking application with React frontend, Express backend, and Neon PostgreSQL.

## Stack

- Frontend: React 18, TypeScript, Vite
- Backend: Express 4, TypeScript
- Database: Neon PostgreSQL (using `pg` pool)
- Infra: Docker, Nginx, Netlify-compatible frontend build

## Quick Start

1. Install dependencies.

```bash
cd backend
npm install
cd ../frontend
npm install
```

2. Configure backend environment.

```bash
cd ../backend
copy .env.example .env
```

3. Edit `backend/.env` and set these values:

```env
JWT_SECRET=your-long-random-secret
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
DATABASE_URL=postgresql://<user>:<password>@<neon-host>/<db>?uselibpqcompat=true&sslmode=require
DATABASE_SSL=true
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_POOL_MAX=10
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_CURRENCY=sgd
```

4. Run DB bootstrap scripts.

```bash
npm run db:migrate
npm run db:seed
npm run db:smoke:slot-lock
```

The supported local database setup sequence is `db:migrate` followed by `db:seed`. No separate login test-data script is required.

If you need to wipe and repopulate all seed data, use `npm run db:reset:seed`.

5. Start backend and frontend.

```bash
# terminal 1
cd backend
npm run dev

# terminal 2
cd frontend
npm run dev
```

6. Open the app at `http://localhost:5173`.

## Slot Creation and Availability

### How slots are generated

Slots are generated lazily, per sport facility and requested date. They are not pre-created for a fixed calendar window during `db:seed`.

1. The client requests `GET /api/slots` with a date, sport ID, and facility code.
2. The API verifies that the sport/facility pair exists and is enabled.
3. `listSlotsForDate` calls `ensureSlotsForDate` before returning availability.
4. The application finds the operating window for the requested date. An exact-date availability exception takes precedence; otherwise it uses that facility's weekday configuration.
5. It splits the resolved window into 30-minute segments. A window of `16:00` through `19:00`, for example, creates `16:00`, `16:30`, `17:00`, `17:30`, `18:00`, and `18:30`; `19:00` is the end boundary and is not itself a slot.
6. Missing rows are inserted into `slots` with `is_booked = false`. Existing rows are preserved, and previously unbooked rows outside a changed configuration window are removed.
7. Active recurring and one-time block rules are applied to those rows, then the API returns each slot with its current availability.

The same `ensureSlotsForDate` operation also runs immediately before an admin blocks a date and before a booking or reschedule is committed. This guarantees that booking and blocking work even when nobody has previously viewed that date.

### How far ahead slots exist

There is **no built-in maximum number of days** for normal slot creation. A slot row is created the first time the system needs a configured date, whether that date is tomorrow or next year. A future date needs:

- an enabled facility;
- a weekday window in `slot_weekday_configurations` for that facility and weekday, or an exact-date record in `slot_availability_exceptions`; and
- a valid calendar date supplied to the slot API or booking/blocking flow.

The default seeded weekday schedule is `16:00-19:00` Monday through Friday and `08:00-19:00` on Saturday and Sunday. Individual 2026 exact-date overrides can expand selected facility windows to `08:00-19:00`.

Past or already-started slots remain in the response but are labelled unavailable using the `Asia/Singapore` clock. The booking endpoint rejects those slots.

### Trigger points

| Trigger | What happens |
| --- | --- |
| `GET /api/slots` | Generates any missing rows for the requested facility/date and returns their availability. |
| `POST /api/slots/block` | Generates missing rows for each selected date, marks the requested range unavailable, and records a one-time block rule. |
| `POST /api/bookings` | Generates missing rows, locks every required 30-minute segment, and marks them booked in one database transaction. |
| Booking reschedule | Generates the destination date's rows before checking and locking the replacement time range. |
| `npm run db:seed` | Seeds configuration, facilities, 2026 exact-date exceptions, and 2026 Academy recurring rules. It does not generate a rolling range of `slots` rows. |
| `npm run db:reset:seed` | Deletes slot rows and related seedable data, then restores configuration and seed rules. Slots are generated again on demand. |

### Slot API details

The API base path is `/api`. All times use 24-hour `HH:MM` notation and only 30-minute boundaries are accepted for blocking rules.

#### List a facility's slots

```http
GET /api/slots?date=2027-01-04&sportId=cricket&facilityCode=net-2
```

No authentication is required. A successful response has this shape:

```json
{
  "slots": [
    {
      "time": "16:00",
      "key": "cricket_net-2_2027-01-04_16:00",
      "booked": false,
      "past": false
    }
  ]
}
```

It returns `400` for missing/invalid parameters or a disabled facility and `422` when no weekday or exact-date configuration exists for the selected date.

#### Create a one-time block

```http
POST /api/slots/block
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "sportId": "cricket",
  "facilityCode": "net-2",
  "dates": ["2027-01-04", "2027-01-05"],
  "startTime": "16:00",
  "endTime": "18:00",
  "reason": "Private event"
}
```

This endpoint requires an admin account. It accepts 1-31 unique current or future dates, blocks the half-open range from `startTime` up to but excluding `endTime`, stores the selected dates in a one-time `slot_block_rules` record, and returns `201` with the block ID and `blockedCount`. A best-effort email confirmation is sent when SMTP is configured.

#### Manage recurring blocks

- `GET /api/slots/blocks` lists one-time and recurring rules (admin JWT required).
- `POST /api/slots/blocks/recurring` creates one rule per selected weekday. Required JSON fields are `sportId`, `facilityCode`, `validFrom`, `validTo`, `weekdays`, `startTime`, `endTime`, and `reason`.
- `PUT /api/slots/blocks/recurring/:id` updates one active recurring rule.
- `DELETE /api/slots/blocks/recurring/:id` soft-deactivates one active recurring rule.

### Slot blocking behavior

One-time blocks belong to one sport facility and explicit dates. When submitted, the system first materializes the affected dates and sets each currently unbooked matching 30-minute slot to `is_booked = true`. It also keeps the rule, so a later expansion of the availability window cannot expose a slot that was blocked earlier.

Recurring blocks belong to one sport facility, an inclusive effective date range, selected weekday(s), and a time range. They are evaluated whenever that facility/date is generated. A row is blocked when its time is greater than or equal to the start time and less than the end time. Editing or deactivating a recurring rule clears rows marked specifically by recurring blocking; the normal availability check then reapplies any remaining booking, reservation, one-time, or recurring conflict.

The availability response considers a slot unavailable when any of these apply:

- the slot row was marked booked by a one-time or recurring block;
- a confirmed or `cash_pending` booking overlaps the 30-minute segment;
- another customer has an unexpired pending reservation for it; or
- the slot is in the past or has already started in Singapore time.

Blocks do not cancel existing bookings. A one-time block reports only the number of rows that were still unbooked when it was applied, so `blockedCount` can be lower than the requested number of segments. If no slot would be newly blocked, the request is rejected and no `slot_block_rules` record is created: `409` when the range is already blocked or booked, `422` when no slots exist in the range or a selected weekday has no slot configuration. The stored rule and the response `dates` omit dates whose requested range is already fully covered by an active block rule.

### Preparing slots for next year

Ordinary slots for the next calendar year require no batch job: keep the weekday configurations active and request, block, or book the next-year date. For example, after configuration exists, `GET /api/slots?date=2027-01-04&sportId=cricket&facilityCode=net-2` creates its rows on demand.

Use this annual checklist for year-specific availability and block-outs:

1. Review every enabled facility's weekday schedule in `slot_weekday_configurations`. The seed creates all seven weekdays for every default facility, so this is normally already sufficient for the next year.
2. Add new records to `slot_availability_exceptions` for dates whose opening window differs from their weekday schedule. The current seeded exception list is explicitly named `EXCEPTION_FACILITIES_2026`; it does not automatically carry into 2027.
3. Create recurring Academy or operational block rules with `validFrom` and `validTo` covering the new year through `POST /api/slots/blocks/recurring`, or update the code seed data if those rules must be installed automatically in every environment. The supplied Academy seed rules run only from `2026-01-01` through `2026-12-31`.
4. Add planned closures or special events with `POST /api/slots/block`. One request can cover up to 31 dates for one facility and time range.
5. Verify representative weekday, weekend, exception, and blocked dates with `GET /api/slots`, confirming both the generated time range and the `booked` status.
6. Run `cd backend && npm run db:smoke:slot-lock` against the configured database. Update its year-specific 2026 assertions before treating it as a 2027 regression check.

## Database Configuration (Easy Steps)

### Step 1: Create Neon project

1. Sign in at `https://neon.tech`.
2. Create a project and database.
3. Copy the connection string.

### Step 2: Configure backend `.env`

Set `DATABASE_URL` from Neon. Keep SSL enabled:

```env
DATABASE_SSL=true
```

### Step 3: Initialize schema and seed

From `backend/`:

```bash
npm run db:migrate
npm run db:seed
npm run db:reset:seed
```

Seed now creates:

- package catalog rows
- sports catalog rows for `GET /api/sports`
- sport event cards for `GET /api/sports/:sportId/events`
- sport facility cards for `GET /api/sports/:sportId/facilities`
- sport/facility weekday slot configuration rows (`slot_weekday_configurations`)
- exact-date 2026 availability overrides (`slot_availability_exceptions`)
- unified one-time and recurring block rules, including 2026 SGO Academy block-outs (`slot_block_rules`)

Slot windows are resolved from an exact-date availability exception first, then the facility weekday configuration. Unified one-time and recurring block rules, bookings, reservations, and past-slot rules remain unavailable within the resolved window. Existing `admin_slot_blocks` and `slot_recurring_blocks` records are migrated automatically into `slot_block_rules` during schema migration.

### Step 4: Validate health

Call:

```bash
curl http://localhost:3001/api/health
```

Expected response includes database readiness metadata:

```json
{
  "status": "ok",
  "timestamp": "2026-07-22T00:00:00.000Z",
  "database": {
    "configured": true
  }
}
```

## Project Structure

```text
sg-booking-app/
  frontend/
    src/
      components/
      context/
      lib/
      screens/
      types/
  backend/
    src/
      index.ts
      middleware/
      routes/
      lib/database.ts
      scripts/migrate.ts
      scripts/seed.ts
      scripts/resetSeed.ts
  docker-compose.yml
  Dockerfile.backend
  Dockerfile.frontend
  README.md
  KnowledgeBase.md
```

## Backend API

Base path: `/api`

- `GET /health` - service health with DB configured flag
- `POST /auth/login` - email/password login
- `POST /auth/google` - Google login token verification
- `GET /slots?date=YYYY-MM-DD&sportId=<sport-id>&facilityCode=<facility-code>` - facility slot availability
- `POST /slots/block` - create an admin one-time facility block
- `GET /slots/blocks` - list one-time, recurring, seeded Academy, and legacy block rules (admin required)
- `POST /slots/blocks/recurring` - create recurring facility block rules (admin required)
- `PUT /slots/blocks/recurring/:id` - edit a recurring or seeded Academy rule (admin required)
- `DELETE /slots/blocks/recurring/:id` - deactivate a recurring or seeded Academy rule (admin required)
- `GET /bookings` - fetch current user booking history (auth required)
- `POST /bookings` - create booking (auth required)
- `GET /packages` - package list
- `GET /sports` - sports list from PostgreSQL
- `GET /sports/:sportId/events` - sport events list from PostgreSQL
- `GET /sports/:sportId/facilities` - sport facility cards list from PostgreSQL

Booking protection:

- slot booking is atomic at database level
- if a slot is already booked, API returns `409` with message:
  `This slot is already booked. Please select a different time slot.`
- booking writes always use the authenticated JWT email (not client payload email)

Auth persistence:

- login and Google sign-in now upsert the user in database when `DATABASE_URL` is configured

Database reset utility:

- `npm run db:reset:seed` is the supported reset operation. It truncates seedable tables, including `slots`, then repopulates schema configuration and seed rules. Slot rows are recreated on demand.
- `POST /api/dev/reset-seed` is currently disabled in the source and must not be used for environment resets.

## Environment Variables

### Backend (`backend/.env`)

- `PORT` default `3001`
- `FRONTEND_URL` default `http://localhost:5173`
- `JWT_SECRET` required
- `DATABASE_URL` required for Neon/Postgres mode
- `DATABASE_SSL` default `true`
- `DATABASE_CONNECTION_TIMEOUT_MS` default `5000`
- `DATABASE_POOL_MAX` default `10`
- `STRIPE_SECRET_KEY` required for card checkout and booking confirmation
- `STRIPE_CURRENCY` optional, defaults to `sgd`

### Frontend (`frontend/.env.local`)

- `VITE_API_BASE_URL` optional, defaults to proxy in local dev
- `VITE_ENABLE_CATALOG_FALLBACK` optional, defaults to `false`; set to `true` only for an emergency/demo fallback on Sport Select and Sport Events when the API is unavailable
- `VITE_STRIPE_PUBLISHABLE_KEY` required for Stripe card checkout in the browser

## Stripe card payments

Card checkout uses Stripe Elements in the frontend and a backend PaymentIntent route:

- Frontend: set `VITE_STRIPE_PUBLISHABLE_KEY` in `frontend/.env.local`
- Backend: set `STRIPE_SECRET_KEY` (and optionally `STRIPE_CURRENCY=sgd`) in `backend/.env`

Recommended local setup:

1. Create a Stripe account and open the Dashboard -> Developers -> API keys page.
2. Copy the publishable key into `frontend/.env.local`.
3. Copy the secret key into `backend/.env`.
4. Use Stripe test mode keys for local development and switch to live keys only for production.
5. Verify the checkout flow by selecting a payment method and completing a test card payment.

The backend creates a PaymentIntent for the booking total and the frontend confirms the card payment before the booking request is submitted.

## Environment-Specific Deployment

### Local Deployment (Developer Machine)

Use this mode for feature development and QA walkthroughs.

Backend environment (`backend/.env`):

```env
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
JWT_SECRET=your-local-dev-secret
DATABASE_URL=postgresql://<user>:<password>@<neon-host>/<db>?uselibpqcompat=true&sslmode=require
DATABASE_SSL=true
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_POOL_MAX=10
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_CURRENCY=sgd
```

Frontend environment (`frontend/.env.local`):

```env
VITE_API_BASE_URL=
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
```

Run sequence:

```bash
# terminal 1
cd backend
npm install
npm run db:migrate
npm run db:seed
npm run dev

# terminal 2
cd frontend
npm install
npm run dev
```

Local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Health: `http://localhost:3001/api/health`

To reset a local database, stop the backend and run `npm run db:reset:seed` from `backend/`.

### Production Deployment

Use this mode for client-facing hosting.

Recommended cost-effective and widely accepted setup:

- Frontend: Netlify (static hosting, simple CI/CD, low ops overhead)
- Backend: Render or Railway for fastest managed deployment
- Backend at scale: Cloud Run when you need stronger autoscaling and enterprise-grade GCP integration

Backend environment (Render/Railway/Cloud Run):

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-frontend-domain.com
JWT_SECRET=<strong-random-secret>
DATABASE_URL=postgresql://<user>:<password>@<neon-host>/<db>?uselibpqcompat=true&sslmode=require
DATABASE_SSL=true
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_POOL_MAX=20
```

Production rules:

- Store all secrets in platform secret manager, not in repository files.

Frontend environment for production build:

```env
VITE_API_BASE_URL=https://your-backend-domain.com
```

Production build commands:

```bash
# backend
cd backend
npm ci
npm run build
npm start

# frontend
cd frontend
npm ci
npm run build
```

### Deployment Commands and Steps

#### GitHub Direct Deployment Strategy (Required)

Use GitHub repository integration directly for both frontend and backend deployments.

Branch policy:

- Source branch for deployment: `main`
- Auto-deploy trigger: every push/merge to `main`
- Recommended protection: PR reviews + status checks on `main`

Repository layout assumption:

- Frontend app path: `frontend`
- Backend app path: `backend`

This enables a single repository with separate platform services for frontend and backend, both continuously deployed from `main`.

#### Frontend Deployment to Netlify (Recommended)

GitHub-connected deployment from `main` (preferred):

1. In Netlify: Add new site -> Import from Git -> GitHub.
2. Select this repository.
3. Configure build settings:

- Base directory: `frontend`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Functions directory: leave blank
- Production branch: `main`

4. Create the site.

5. Add environment variables in Netlify UI:

- `VITE_API_BASE_URL=https://your-backend-domain.com`
- `VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com` (if Google login is enabled)

You can add `VITE_API_BASE_URL` after the site is created. Because Vite reads it at build time, trigger a redeploy after adding or changing it.

6. Enable auto-deploys (default) so each push to `main` deploys frontend.

1. Build frontend locally to validate before deploy.

```bash
cd frontend
npm ci
npm run build
```

2. Deploy using Netlify CLI.

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=frontend/dist
```

3. Configure Netlify environment variable:

- `VITE_API_BASE_URL=https://your-backend-domain.com`

If you add or change `VITE_API_BASE_URL` after the first deploy, redeploy the site so the frontend build picks it up.

4. If using Google login, also set:

- `VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com`

#### Backend Deployment to Render (Cost-Effective Default)

GitHub-connected deployment from `main` (preferred):

1. In Render: New Web Service -> Connect GitHub repository.
2. Select this repository and configure:

- Branch: `main`
- Root directory: `backend`
- Build command: `npm ci && npm run build`
- Start command: `npm start`

3. Add environment variables in Render dashboard (production values).
4. Enable auto-deploy from `main` so backend updates on every merge.

1. Push repository to Git provider (GitHub/GitLab/Bitbucket).
2. In Render, create a new Web Service.
3. Configure service settings:

- Root directory: `backend`
- Build command: `npm ci && npm run build`
- Start command: `npm start`

4. Add production environment variables in Render dashboard:

- `NODE_ENV=production`
- `PORT=3001`
- `FRONTEND_URL=https://your-frontend-domain.com`
- `JWT_SECRET=<strong-random-secret>`
- `GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com`
- `DATABASE_URL=postgresql://<user>:<password>@<neon-host>/<db>?uselibpqcompat=true&sslmode=require`
- `DATABASE_SSL=true`
- `DATABASE_CONNECTION_TIMEOUT_MS=5000`
- `DATABASE_POOL_MAX=20`

5. Trigger deploy from Render UI and verify:

```bash
curl https://your-backend-domain.com/api/health
```

#### Backend Deployment to Railway (Fast Setup Alternative)

GitHub-connected deployment from `main` (preferred):

1. Create Railway project from GitHub repository.
2. Service configuration:

- Branch: `main`
- Root directory: `backend`
- Build: `npm ci && npm run build`
- Start: `npm start`

3. Add production environment variables.
4. Keep automatic deploys enabled for pushes to `main`.

1. Create project from Git repository in Railway.
2. Set service root to `backend`.
3. Configure commands:

- Build: `npm ci && npm run build`
- Start: `npm start`

4. Add the same production environment variables as Render.
5. Deploy and verify:

```bash
curl https://your-backend-domain.com/api/health
```

#### Backend Deployment to Cloud Run (Scale Path)

GitHub-connected deployment from `main` (preferred path):

Option A: Cloud Build trigger from GitHub

1. Connect GitHub repository to Cloud Build.
2. Create trigger:

- Event: push to branch
- Branch regex: `^main$`
- Build config: use `cloudbuild.yaml` or Docker build command for `Dockerfile.backend`

3. Build image and deploy to Cloud Run from the trigger pipeline.

Option B: Manual gcloud commands (fallback)

1. Authenticate and set GCP project.

```bash
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
```

2. Build backend container image from repository root.

```bash
gcloud builds submit --tag gcr.io/YOUR_GCP_PROJECT_ID/sg-booking-app-backend:v1.0.0 -f Dockerfile.backend .
```

3. Deploy to Cloud Run.

```bash
gcloud run deploy sg-booking-app-backend \
  --image gcr.io/YOUR_GCP_PROJECT_ID/sg-booking-app-backend:v1.0.0 \
  --region YOUR_REGION \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,PORT=3001,FRONTEND_URL=https://your-frontend-domain.com,DATABASE_SSL=true,DATABASE_CONNECTION_TIMEOUT_MS=5000,DATABASE_POOL_MAX=20 \
  --set-secrets JWT_SECRET=JWT_SECRET:latest,DATABASE_URL=DATABASE_URL:latest
```

4. Verify health endpoint after deployment.

```bash
curl https://your-backend-domain.com/api/health
```

#### Post-Deployment Validation Checklist

1. `GET /api/health` returns `status: ok`.
2. `GET /api/slots` returns slot data for a valid date.
3. Login and booking create/list flows work end-to-end.
4. CORS allows only your production frontend domain.

### GitHub Main Branch Direct Deployment

Use this workflow when you want deployments to happen automatically from the `main` branch for both frontend and backend.

#### 1. Repository Preparation

1. Keep frontend and backend in the same GitHub repository.
2. Use `main` as the production deployment branch.
3. Protect `main` with required reviews and checks.

Recommended local release flow:

```bash
git checkout main
git pull origin main

# after validating changes
git add .
git commit -m "release: <short description>"
git push origin main
```

#### 2. Frontend Auto Deploy from main (Netlify)

1. In Netlify, choose Add new site -> Import an existing project -> GitHub.
2. Select this repository and set production branch to `main`.
3. Configure build settings:

- Base directory: `frontend`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Functions directory: leave blank

4. Add environment variables in Netlify:

- `VITE_API_BASE_URL=https://your-backend-domain.com`

You can create the Netlify site before adding `VITE_API_BASE_URL`, but you must redeploy after setting it.

5. Enable auto deploy on push to `main`.

Result:

- Every push/merge to `main` triggers frontend production deployment automatically.

#### 3. Backend Auto Deploy from main (Render)

1. In Render, create a Web Service from GitHub repository.
2. Set branch to `main`.
3. Set root directory to `backend`.
4. Configure:

- Build command: `npm ci && npm run build`
- Start command: `npm start`

5. Add backend environment variables in Render:

- `NODE_ENV=production`
- `PORT=3001`
- `FRONTEND_URL=https://your-frontend-domain.com`
- `JWT_SECRET=<strong-random-secret>`
- `DATABASE_URL=postgresql://<user>:<password>@<neon-host>/<db>?uselibpqcompat=true&sslmode=require`
- `DATABASE_SSL=true`
- `DATABASE_CONNECTION_TIMEOUT_MS=5000`
- `DATABASE_POOL_MAX=20`

6. Enable Auto-Deploy from `main`.

Result:

- Every push/merge to `main` triggers backend production deployment automatically.

#### 4. Backend Auto Deploy from main (Railway Alternative)

1. Create Railway project from GitHub repository.
2. Set service source branch to `main`.
3. Set root directory to `backend`.
4. Configure commands:

- Build: `npm ci && npm run build`
- Start: `npm start`

5. Add the same backend production environment variables.
6. Enable automatic deploys for commits to `main`.

#### 5. Recommended Production Sequence

1. Merge tested changes into `main`.
2. Wait for backend deployment to complete.
3. Wait for frontend deployment to complete.
4. Run smoke checks:

```bash
curl https://your-backend-domain.com/api/health
```

5. Open frontend production URL and verify login, slot listing, and booking flow.
6. Verify latest commit on `main` is reflected in both frontend and backend deployments.

### Docker Deployment by Environment

Local Docker compose:

```bash
docker compose up --build
```

Production container build examples:

```bash
# backend image
docker build -f Dockerfile.backend -t sg-booking-app-backend:v1.0.0 .

# frontend image
docker build -f Dockerfile.frontend --build-arg VITE_API_BASE_URL=https://your-backend-domain.com -t sg-booking-app-frontend:v1.0.0 .
```

Before go-live, verify:

- `/api/health` returns `status: ok`
- booking create/list APIs work with real DB
- CORS matches exact production frontend domain
- Google login works with production domain in OAuth settings

## Docker

Run locally:

```bash
docker compose up --build
```

Service names and containers:

- Backend container: `sg-booking-app-backend`
- Frontend container: `sg-booking-app-frontend`
- Network: `sg-booking-app-network`

## Build Commands

Backend:

```bash
cd backend
npm run build
```

Frontend:

```bash
cd frontend
npm run build
```

## Troubleshooting

- API errors from frontend:
set `VITE_API_BASE_URL` correctly for production.
- CORS errors:
ensure `FRONTEND_URL` exactly matches frontend origin.
- DB not writing:
validate `DATABASE_URL` and run `npm run db:migrate`.
- Slot lock verification:
run `npm run db:smoke:slot-lock` in `backend/` to verify duplicate booking rejection.
- Slot already booked error:
the slot was claimed by another user; choose another slot and retry.
- Slot list empty/unexpected:
run `npm run db:seed` again.
- My Bookings appears empty:
create at least one booking with your logged-in account and refresh My Bookings.
- Auth token errors:
check `JWT_SECRET` and request `Authorization: Bearer <token>`.

## Deployment Notes

- Frontend can be deployed to Netlify (static).
- Backend can be deployed to Render/Railway/Cloud Run.
- Both frontend and backend should be connected directly to the same GitHub repository and deployed from `main`.
- Suggested default for most teams: Netlify + Render (balanced cost, speed, and maintainability).
- Suggested alternative: Netlify + Railway (very fast setup and iteration for small teams).
- Suggested scale path: Netlify + Cloud Run (best when expecting variable load or GCP-native operations).
- Set backend environment variables securely in platform secrets.
- Do not commit real credentials.
