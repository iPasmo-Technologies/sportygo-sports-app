# Neon PostgreSQL Database Configuration README

This guide explains how to create and configure the Neon PostgreSQL database for the SportyGo application.

Target database name: `sportygo-app-db`

The application backend expects a PostgreSQL connection through `DATABASE_URL` and uses the Node `pg` connection pool with SSL enabled.

---

## 1. Prerequisites

Before starting, make sure you have:

- A Neon account: `https://neon.com`
- Access to the Neon organization that will own the project
- Permission to create projects, databases, and roles
- The SportyGo backend source code available locally
- Backend dependencies installed from `backend/`

```bash
cd backend
npm install
```

---

## 2. Recommended Neon Structure

Recommended production structure:

- Neon organization: your company/team organization
- Neon project: `sportygo-app`
- Production branch: `main`
- Production database: `sportygo-app-db`
- Owner/admin role: an existing privileged owner role in Neon
- Application role/user: a separate login role used by the backend

Use a dedicated application role instead of connecting the app with a personal/admin owner account. This keeps credentials easier to rotate and limits operational risk.

---

## 3. Create the Neon Project

1. Open `https://console.neon.tech`.
2. Select the correct organization.
3. Click **New Project**.
4. Choose the cloud provider and region closest to the application backend hosting region.
   - For Render, Netlify server functions, or Cloudflare Workers, prefer the region with the lowest measured latency from the backend.
   - Keep production backend and database in nearby regions when possible.
5. Set the project name to:

```text
sportygo-app
```

6. During project creation, Neon may ask for an initial database name. Use:

```text
sportygo-app-db
```

7. Finish project creation.

If the database was not created during the project wizard, create it manually using the steps below.

---

## 4. Create the Database `sportygo-app-db`

1. Open the Neon project.
2. Go to **Databases**.
3. Click **New database**.
4. Enter the database name:

```text
sportygo-app-db
```

5. Choose the owner role.
   - If you already have an owner/admin role for this project, assign that existing owner role.
   - Example owner role name: `sportygo_owner`.
6. Click **Create database**.

If using SQL from the Neon SQL Editor instead, run this as an owner/admin role:

```sql
CREATE DATABASE "sportygo-app-db" OWNER sportygo_owner;
```

Use double quotes because the database name contains hyphens.

---

## 5. Create a New Application User Assigned to the Existing Owner Role

Neon roles map to PostgreSQL roles. For the application, create a new role/user with login access and grant it the existing owner role.

Example values:

- Existing owner role: `sportygo_owner`
- New app role/user: `sportygo_app_user`
- Database: `sportygo-app-db`

### Option A: Create from Neon Console

1. Open the Neon project.
2. Go to **Roles**.
3. Click **New role**.
4. Create a role named:

```text
sportygo_app_user
```

5. Generate or set a strong password.
6. Store the password in a secure password manager.
7. Open the Neon SQL Editor as an owner/admin role.
8. Run the grants below.

### Option B: Create from SQL

Run the following as an owner/admin role:

```sql
CREATE ROLE sportygo_app_user WITH LOGIN PASSWORD 'replace-with-a-strong-password';
GRANT sportygo_owner TO sportygo_app_user;
```

Then connect to `sportygo-app-db` and grant schema privileges:

```sql
GRANT CONNECT ON DATABASE "sportygo-app-db" TO sportygo_app_user;
GRANT USAGE, CREATE ON SCHEMA public TO sportygo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sportygo_app_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO sportygo_app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sportygo_app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sportygo_app_user;
```

Because this project runs migrations from the backend, the application user needs enough privilege to create and alter schema objects unless you run migrations separately with the owner role.

Recommended production option:

- Use `sportygo_owner` or a migration-only role for deployment migrations.
- Use `sportygo_app_user` for runtime application traffic.
- If keeping the setup simple, granting the existing owner role to `sportygo_app_user` works, but review this before production launch.

---

## 6. Get the Neon Connection String

1. Open the Neon project.
2. Click **Connect** or **Connection details**.
3. Select:
   - Branch: `main`
   - Database: `sportygo-app-db`
   - Role: `sportygo_app_user`
   - Connection type: pooled connection for application runtime, if available
4. Copy the PostgreSQL connection string.

Expected format:

```text
postgresql://sportygo_app_user:<password>@<host>/<database>?sslmode=require
```

For this app:

```text
postgresql://sportygo_app_user:<password>@<neon-host>/sportygo-app-db?sslmode=require
```

If Neon provides both pooled and direct URLs:

- Use the pooled URL for the deployed backend application.
- Use the direct URL for migrations if Neon recommends direct connections for DDL operations in your project.
- Keep both values secret. Do not commit them to Git.

Example local `.env` value:

```env
DATABASE_URL=postgresql://sportygo_app_user:replace-with-password@ep-example-123456.ap-southeast-1.aws.neon.tech/sportygo-app-db?sslmode=require
DATABASE_SSL=true
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_POOL_MAX=10
```

Some existing project examples may include `uselibpqcompat=true`. If Neon provides that parameter in the copied connection string, keep it:

```env
DATABASE_URL=postgresql://sportygo_app_user:replace-with-password@ep-example-123456.ap-southeast-1.aws.neon.tech/sportygo-app-db?sslmode=require&uselibpqcompat=true
```

---

## 7. Configure SportyGo Backend Environment

Update `backend/.env` locally and the deployed backend environment variables.

Minimum required database values:

```env
DATABASE_URL=postgresql://sportygo_app_user:<password>@<neon-host>/sportygo-app-db?sslmode=require
DATABASE_SSL=true
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_POOL_MAX=10
```

Important related backend values:

```env
JWT_SECRET=<long-random-secret>
FRONTEND_URL=http://localhost:5173
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_CURRENCY=sgd
```

For production, set `FRONTEND_URL` to the deployed frontend origin, for example:

```env
FRONTEND_URL=https://your-production-frontend.example.com
```

Do not store production secrets in source control.

---

## 8. Initialize the Database Schema and Seed Data

From the backend folder:

```bash
cd backend
npm run db:migrate
npm run db:seed
```

To reset and repopulate seed data:

```bash
npm run db:reset:seed
```

Run the slot-lock smoke test:

```bash
npm run db:smoke:slot-lock
```

Start the backend:

```bash
npm run dev
```

Confirm the health endpoint:

```bash
curl http://localhost:3001/api/health
```

The response should show that the database is configured.

---

## 9. Deployment Configuration

Set the same database variables in the deployed backend environment.

For Cloudflare Workers, store the connection string as a secret instead of committing it:

```bash
npx wrangler secret put DATABASE_URL
```

Also configure:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put FRONTEND_URL
```

For Render, Netlify, or another backend host, add the values through that platform's environment variable dashboard.

After changing production environment variables, redeploy or restart the backend service.

---

## 10. Important Production Checks

Before using the database in production, confirm:

- The database name is exactly `sportygo-app-db`.
- The backend uses `DATABASE_URL` with `sslmode=require`.
- `DATABASE_SSL=true` is set.
- Production secrets are not committed to Git.
- The application uses the app role/user, not a personal Neon account password.
- Migrations run successfully against the production database.
- Seed data is loaded only when intended.
- The health endpoint reports database readiness.
- Slot booking conflict behavior is tested with `npm run db:smoke:slot-lock`.
- Backups, restore window, and monitoring retention match the business risk.
- Billing alerts are configured before real customer traffic starts.

---

## 11. Neon Pricing Summary

Pricing changes over time, so verify final numbers at `https://neon.com/pricing` before purchase. As of 2026-08-22, Neon lists these plans:

| Item | Free | Launch | Scale |
| --- | --- | --- | --- |
| Monthly base price | `$0/month` | Pay for what you use | Pay for what you use |
| Best for | Prototypes, side projects, small teams | Startups and growing teams | Production-grade workloads and larger companies |
| Projects | 100 | 100 | 1,000, increase available on request |
| Branches per project | 10 | 10 | 25 |
| Extra branches | Not available | `$1.50/branch-month`, prorated hourly | `$1.50/branch-month`, prorated hourly |
| Compute | 100 CU-hours/project included | `$0.106/CU-hour` | `$0.222/CU-hour` |
| Autoscaling | Up to 2 CU / 8 GB RAM | Up to 16 CU / 64 GB RAM | Up to 16 CU autoscaling, fixed sizes up to 56 CU / 224 GB RAM |
| Scale to zero | After 5 minutes, always enabled | After 5 minutes, can be disabled | Configurable from 1 minute to always on |
| Storage | 0.5 GB/project included | `$0.35/GB-month` | `$0.35/GB-month` |
| Public network transfer | 5 GB included | 500 GB/project included, then `$0.10/GB` | 500 GB/project included, then `$0.10/GB` |
| Monitoring retention | 1 day | 3 days | 14 days |
| Instant restore/history | 6 hours, capped | Up to 7 days, `$0.20/GB-month` | Up to 30 days, `$0.20/GB-month` |
| Manual snapshots | 1 | 100 | 100 |
| Snapshot storage | Check current docs | `$0.09/GB-month` | `$0.09/GB-month` |
| Spending notifications | No | Yes | Yes |
| Protected branches | No | Yes | Yes |
| IP allow rules | No | No | Yes |
| Private networking | No | No | Yes, private transfer billed separately |
| Compliance/SLA | Community-level only | Billing support | SOC/ISO/GDPR/HIPAA options, uptime SLA, standard support |

Cost formula examples:

```text
Compute cost = compute size in CU * active hours * plan CU-hour rate
Storage cost = stored GB * $0.35 per GB-month
Extra branch cost = extra branch count * active month fraction * $1.50
Public egress over included limit = extra GB * $0.10
Instant restore history = history GB-month * $0.20
```

For SportyGo early development, the Free plan is usually enough if traffic, data size, and egress stay low. For a real production launch with paid bookings, Launch is the practical minimum because it adds spending notifications, protected branches, larger storage/egress capacity, paid support for billing, scheduled backup support, and the ability to disable scale-to-zero if cold starts affect booking UX.

---

## 12. How to Check Whether an Upgrade Is Needed

Use this checklist monthly during development and weekly after launch.

### In Neon Console

1. Open the Neon project.
2. Go to **Monitoring**.
3. Check:
   - CPU usage
   - RAM usage
   - connection count
   - query latency
   - database size
   - network transfer
4. Go to **Billing** or **Usage**.
5. Check:
   - CU-hours used this month
   - storage used by root branches
   - storage used by child branches
   - public network transfer
   - history/instant restore usage
   - snapshot storage
   - number of branches
6. Go to **Branches**.
7. Delete unused development or preview branches.
8. Confirm whether the production branch is protected if using a paid plan.

### In the SportyGo Application

Monitor these application signals:

- Booking checkout feels slow after idle periods.
- Users see intermittent booking failures during traffic spikes.
- `/api/health` becomes slow or unreliable.
- Slot availability calls slow down at peak hours.
- Database connections approach the configured pool/concurrency limit.
- Monthly usage approaches Free plan limits.
- Storage approaches 0.5 GB on Free.
- Public network transfer approaches 5 GB on Free.
- The business requires better restore coverage than 6 hours.
- The team needs more than 1 day of metrics history.

### Upgrade Decision Guide

Stay on Free when:

- The app is in development or demo mode.
- Usage is low and non-critical.
- 0.5 GB storage is enough.
- 5 GB monthly egress is enough.
- 6-hour restore history is acceptable.
- Cold starts after idle periods are acceptable.

Upgrade to Launch when:

- SportyGo starts handling real bookings or payments.
- You need spending notifications.
- You need protected production branches.
- You need more storage or public network transfer.
- You need up to 7 days of restore history.
- You need scheduled backups.
- You want the option to disable scale-to-zero for faster first requests.
- You want autoscaling up to 16 CU.

Upgrade to Scale when:

- You need uptime SLA coverage.
- You need IP allow rules.
- You need private networking.
- You need compliance support such as SOC, ISO, GDPR, CCPA, or HIPAA.
- You need 14 days of monitoring retention.
- You need up to 30 days of restore history.
- You need larger fixed compute sizes beyond Launch autoscaling limits.
- You need standard support for a production-grade workload.

Recommended path for this application:

```text
Development/demo: Free
First production launch: Launch
High-traffic/compliance-sensitive production: Scale
```

---

## 13. Security and Reliability Recommendations

- Use one database per environment: development, staging, and production should not share the same production database.
- Use separate Neon branches for preview/testing when appropriate.
- Use a dedicated runtime role for the app and a separate migration/admin role for schema changes.
- Rotate database passwords after team member changes or suspected exposure.
- Keep `DATABASE_POOL_MAX` conservative for serverless or autoscaled backend deployments.
- Keep SSL enabled for all Neon connections.
- Configure spending notifications on paid plans.
- Configure backups/snapshots before launch.
- Test restore procedures before relying on them.
- Add indexes for high-volume booking lookup paths if query latency increases.
- Avoid running destructive seed/reset commands against production unless explicitly intended.

---

## 14. Troubleshooting

### Connection fails with SSL errors

Confirm:

```env
DATABASE_SSL=true
```

Also confirm the URL includes:

```text
sslmode=require
```

### Database name with hyphen fails in SQL

Use double quotes in SQL:

```sql
CREATE DATABASE "sportygo-app-db";
```

### Permission denied during migration

The role running migrations needs schema privileges. Either:

- Run migrations with the owner/migration role, or
- Grant the application role owner-equivalent privileges for this project.

### Free plan compute is suspended

Check whether Free plan CU-hours or egress are exhausted. Upgrade to Launch or wait until the next billing period.

### First request is slow after inactivity

This can happen when scale-to-zero resumes compute. On Launch or Scale, consider disabling or adjusting scale-to-zero for production if booking UX is affected.
