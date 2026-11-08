# AWS Deployment Guide (Container Stack + RDS PostgreSQL)

This guide is for deploying `sg-booking-app` on AWS with your selected stack:

- Frontend: AWS S3 + CloudFront
- Backend: AWS ECS Fargate (container-based)
- Database: AWS RDS PostgreSQL
- CI/CD source: GitHub repository

Repository:
- https://github.com/ipasmo/sg-booking-app

---

## 1. Final Architecture (Simple and Production-Ready)

1. Frontend
- Build React app from `frontend/`
- Host static files in S3 bucket
- Serve globally via CloudFront CDN

2. Backend
- Build backend Docker image from `Dockerfile.backend`
- Push image to ECR
- Run Express API as ECS Fargate service

3. Database
- Use RDS PostgreSQL (managed Postgres)
- Connect backend using `DATABASE_URL`

4. Domain and SSL
- Route53 for DNS (optional if you already have DNS elsewhere)
- ACM certificate for HTTPS

---

## 2. Why this stack

1. Minimal backend rewrite
- Your current Express backend can run as-is in containers.

2. Managed operations
- ECS handles orchestration.
- RDS handles backups, patching windows, monitoring integrations.

3. GitHub integration
- Automated build/deploy can be done through GitHub Actions or AWS CodePipeline.

---

## 3. Deployment Steps (End-to-End)

## Step A: Prepare AWS accounts and baseline resources

1. Choose AWS region (recommended for your location): `ap-southeast-1` (Singapore).
2. Create IAM users/roles for deployment.
3. Create ECR repository for backend image.
4. Create S3 bucket for frontend artifacts.

## Step B: Deploy database (RDS PostgreSQL)

1. Create RDS PostgreSQL instance:
- Engine: PostgreSQL
- Class: start with burstable small instance (for small traffic)
- Single-AZ for cost efficiency
- Enable automated backups

2. Configure security:
- Place DB in private subnets
- Allow inbound only from ECS security group
- Do not open DB to public internet

3. Capture connection values:
- Host
- Port
- Username/password
- Database name

4. Build `DATABASE_URL`:
- `postgresql://<user>:<password>@<host>:5432/<db>`

## Step C: Deploy backend on ECS Fargate

1. Build and push backend image:
- Build from `Dockerfile.backend`
- Push to ECR

2. Create ECS cluster and service:
- Launch type: Fargate
- Task definition with your container
- Set CPU/memory small to start

3. Configure environment variables/secrets:
- `NODE_ENV=production`
- `PORT=3001`
- `JWT_SECRET=<strong-secret>`
- `DATABASE_URL=<RDS URL>`
- `DATABASE_SSL=true` (if your connection policy requires)
- `FRONTEND_URL=https://app.yourdomain.com`
- `GOOGLE_CLIENT_ID=<optional>`
- `STRIPE_SECRET_KEY=<stripe-secret-key>`
- `STRIPE_CURRENCY=sgd`

4. Expose API:
- Use Application Load Balancer (ALB)
- Configure HTTPS listener with ACM certificate
- Route to ECS target group

5. Verify backend:
- `GET /api/health` returns status `ok`

## Step D: Deploy frontend on S3 + CloudFront

1. Build frontend:
- In `frontend/`, run `npm run build`

2. Upload `frontend/dist` to S3 bucket.

3. Create CloudFront distribution:
- Origin: S3 bucket
- Default root object: `index.html`

4. SPA routing:
- Configure CloudFront custom error response:
  - 403/404 -> `/index.html` with 200 response

5. Set frontend env vars before build:
- `VITE_API_BASE_URL=https://api.yourdomain.com`
- `VITE_STRIPE_PUBLISHABLE_KEY=<stripe-publishable-key>`

6. Verify UI endpoints and API calls.

## Step E: Connect domain and SSL

1. App domain:
- `app.yourdomain.com` -> CloudFront

2. API domain:
- `api.yourdomain.com` -> ALB

3. ACM certificates:
- Issue and attach certs for both endpoints

## Step F: Initialize production database schema/data

Run once from backend release pipeline or admin runner:

1. `npm run db:migrate`
2. `npm run db:seed`

## Step G: Code changes required for this selected stack

For this chosen stack (ECS Fargate + RDS PostgreSQL), your current codebase needs **minimal changes**.

## Required changes

1. Backend environment configuration only
- Set production env values in ECS task definition:
  - `NODE_ENV=production`
  - `PORT=3001`
  - `FRONTEND_URL=https://app.yourdomain.com`
  - `DATABASE_URL=<RDS PostgreSQL URL>`
  - `DATABASE_SSL=true` (recommended for RDS)
  - `JWT_SECRET=<strong-secret>`

2. Frontend build-time API base URL
- Set:
  - `VITE_API_BASE_URL=https://api.yourdomain.com`

## Strongly recommended code adjustments (small, safe)

1. Add explicit trust proxy in backend startup for ALB-aware headers
- In backend app bootstrap, enable Express proxy trust:
  - `app.set('trust proxy', 1)`

2. Add graceful shutdown handlers for ECS stop events
- Handle `SIGTERM`/`SIGINT` to close DB pool and stop cleanly.

3. Add request logging in production
- Keep lightweight structured logs to CloudWatch for API diagnostics.

## No major rewrites needed

1. No change required to Express route structure.
2. No change required to PostgreSQL schema strategy.
3. No change required to frontend routing approach.

---

## 4. GitHub CI/CD (Low Maintenance Setup)

## Recommended flow

1. Push to feature branch.
2. Open Pull Request.
3. Run CI checks (frontend/backend build + optional tests).
4. Merge to `main`.
5. Auto deploy:
- Frontend: upload new artifacts to S3 + CloudFront invalidation
- Backend: build image, push to ECR, rollout ECS service

## Practical tooling

1. GitHub Actions (simpler if your team is already on GitHub)
2. AWS CodePipeline (fully AWS-managed alternative)

---

## 5. Pricing (Updated for your selected profile)

Your selected assumptions:
- Stack: Container-based backend on ECS Fargate + RDS PostgreSQL
- Traffic: Small (up to ~100k API requests/month)
- Currency: SGD
- Region baseline estimate: `ap-southeast-1`

Conversion assumption used for planning:
- 1 USD ~= 1.35 SGD

Important:
- AWS pricing varies by region, transfer, hours, and storage growth.
- Treat this as budgeting guidance, not an invoice.

## 5.1 Estimated monthly cost breakdown (small traffic)

1. Frontend (S3 + CloudFront)
- Typical estimate: **SGD 2 to SGD 12**
- Depends mainly on CDN data transfer and request volume.

2. Backend compute (ECS Fargate)
- Typical estimate: **SGD 15 to SGD 35**
- Assumes one small always-on API task.

3. API Load Balancer (ALB)
- Typical estimate: **SGD 20 to SGD 40**
- Often a major baseline cost even at low traffic.

4. Database (RDS PostgreSQL single-AZ, small instance)
- Typical estimate: **SGD 25 to SGD 55**
- Includes instance + baseline storage/backups.

5. Logs/monitoring/network overhead
- Typical estimate: **SGD 5 to SGD 20**
- CloudWatch logs/metrics + minor transfer overhead.

## 5.2 Total estimated monthly cost (this AWS stack)

1. Lean small deployment:
- **~SGD 67/month**

2. Practical planning range:
- **~SGD 80 to SGD 160/month**

This range is normal for ECS + ALB + RDS even with small traffic.

---

## 6. Cost Optimization Considerations

1. Biggest cost contributors:
- ALB baseline cost
- Always-on Fargate runtime
- RDS instance uptime

2. Low-effort optimizations:
- Keep one small ECS task initially
- Use single-AZ RDS for early stage
- Tune log retention in CloudWatch
- Avoid unnecessary data transfer between regions

3. Architecture alternatives if you need lower monthly cost:
- Frontend remains S3 + CloudFront
- Backend move to Lambda + API Gateway
- Database use Aurora Serverless v2 or keep RDS small

Note:
- Your current selected container stack is simpler for existing Express code.
- Serverless backend usually lowers idle costs but may need more adaptation.

## 6.1 Lower-cost AWS alternative (for comparison)

If monthly cost becomes a concern, compare this stack:

1. Frontend: S3 + CloudFront (same)
2. Backend: API Gateway + Lambda
3. Database: Aurora PostgreSQL Serverless v2 or RDS PostgreSQL

### Why it can be cheaper at low traffic

1. No always-on ECS task cost.
2. No ALB baseline charge in many API Gateway setups.
3. Pay-per-request compute model aligns with small traffic.

### Estimated monthly range (small traffic, SGD)

1. Lambda + API Gateway + S3/CloudFront + small DB:
- **~SGD 35 to SGD 110/month**

### Trade-off

1. Lower idle cost potential.
2. Usually more adaptation effort than container path for an existing Express service.

---

## 7. Security and Reliability Checklist

1. Store secrets in AWS Secrets Manager or SSM Parameter Store.
2. Restrict DB inbound access to ECS security group only.
3. Enforce HTTPS on app and API domains.
4. Enable automatic RDS backups and snapshot policy.
5. Configure health checks for ECS targets.
6. Set CloudWatch alarms:
- ECS CPU/memory
- ALB 5xx
- RDS storage and connections

---

## 8. Quick Start Summary

1. Create RDS PostgreSQL.
2. Deploy backend container to ECS Fargate behind ALB.
3. Build frontend and host on S3 + CloudFront.
4. Connect custom domains and SSL.
5. Wire GitHub Actions for auto deploy.
6. Run migrate + seed once.
7. Go live.

---

## 9. Final Recommendation for this AWS stack

For your current codebase and minimal rewrite objective:

1. Keep backend containerized on ECS Fargate.
2. Keep PostgreSQL on RDS.
3. Use S3 + CloudFront for frontend.
4. Use GitHub Actions for simple CI/CD.

This is stable and easy to operate, but cost will generally be higher than a pure serverless AWS stack at low traffic.