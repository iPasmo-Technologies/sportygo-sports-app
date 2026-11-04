# Knowledge Base - sg-booking-app

## 1. Application Overview

sg-booking-app is a full-stack sports booking platform with a React frontend and Express backend. It supports sport selection, facility/event exploration, schedule selection, terms confirmation, authentication, checkout, and booking confirmation.

Primary goals:

- Guided, mobile-first booking flow.
- Login-gated payment and bookings operations.
- Production-compatible backend APIs.
- Neon PostgreSQL persistence for slots, packages, and bookings.

## 2. Tech Stack

Frontend:

- React 18 + TypeScript + Vite
- Context + reducer state management (`frontend/src/context/AppContext.tsx`)
- CSS-driven UI theme and layout (`frontend/src/index.css`)

Backend:

- Express 4 + TypeScript
- JWT auth middleware
- PostgreSQL client via `pg` with Neon SSL

Database:

- Neon PostgreSQL
- Bootstrap/migration and seed scripts in backend

## 3. Frontend Architecture

Core files:

- `frontend/src/App.tsx`: screen router by app state.
- `frontend/src/context/AppContext.tsx`: global app state, reducers, navigation guards.
- `frontend/src/lib/api.ts`: backend API calls and integration behavior.
- `frontend/src/types/index.ts`: shared app types.
- `frontend/src/index.css`: all global and screen styles.

Reusable UI components:

- `ScreenHeader.tsx`: common back button + centered logo header.
- `SportsBottomNav.tsx`: common bottom navigation for sports screens.
- `ErrorBanner.tsx`, `Spinner.tsx`, `StepBar.tsx`, UI button wrapper.

Key screens and purpose:

- `HomeScreen.tsx`: entry point.
- `SportSelectScreen.tsx`: choose sport.
- `SportEventsScreen.tsx`: choose event/feature.
- `SportFacilityScreen.tsx`: choose facility card.
- `ScheduleScreen.tsx`: date/time and duration selection.
- `TermsScreen.tsx`: terms acceptance.
- `LoginScreen.tsx`: email/password login.
- `CheckoutScreen.tsx`: payment flow.
- `SuccessScreen.tsx`: booking completion state.
- `BookingsScreen.tsx`: user bookings dashboard.

## 4. Frontend Flow and Guards

Reducer state includes:

- Current screen.
- Selected sport/date/time/package/duration.
- Auth status and token.
- Pricing totals.
- Payment status.
- Post-login redirect target.

Guard behavior (from `navigate` in AppContext):

- Cannot open schedule until booking type is selected.
- Cannot open terms until date/time selected.
- Cannot open checkout when not logged in.
- Bookings screen redirects to login if not authenticated.
- Successful flow enforces screen ordering.

## 5. Backend Architecture

Entry:

- `backend/src/index.ts`

Middleware:

- `backend/src/middleware/authMiddleware.ts`: JWT bearer auth validation.

Routes:

- `backend/src/routes/auth.ts`
  - `POST /api/auth/login`
  - `POST /api/auth/google`
- `backend/src/routes/slots.ts`
  - `GET /api/slots?date=YYYY-MM-DD`
- `backend/src/routes/bookings.ts`
  - `POST /api/bookings` (auth required)
- `backend/src/routes/packages.ts`
  - `GET /api/packages`
- `backend/src/routes/sports.ts`
  - `GET /api/sports`
  - `GET /api/sports/:sportId/events`
  - `GET /api/sports/:sportId/facilities`

Database layer:

- `backend/src/lib/database.ts`
  - Connection pool configuration
  - Schema bootstrap
  - Seed package data
  - Seed sports data for the Choose Your Sport screen
  - Seed sport events data for the Sport Events screen
  - Slot generation and persistence
  - Transactional booking writes

Scripts:

- `backend/src/scripts/migrate.ts`
- `backend/src/scripts/seed.ts`
- `backend/src/scripts/smokeSlotLock.ts`

## 6. Database Model (Neon PostgreSQL)

Tables:

- `packages`
  - id, label, price, per_label, sort_order
  - audit columns: created_at, updated_at, deleted_at, created_by, updated_by

- `sports`
  - id, label, image_key, sort_order
  - used by the Choose Your Sport screen
  - audit columns: created_at, updated_at, deleted_at, created_by, updated_by

- `sport_events`
  - id, title_template, description_template, image_key, icon, action_target, sort_order
  - used by the Sport Events screen
  - audit columns: created_at, updated_at, deleted_at, created_by, updated_by

- `sport_facilities`
  - id, sport_id, code, title_template, price, tag, image_key, icon, action_target, sort_order
  - used by the Sport Facility screen and keyed per selected sport
  - unique constraint on `(sport_id, code)`
  - audit columns: created_at, updated_at, deleted_at, created_by, updated_by

- `slots`
  - id (uuid), slot_date, slot_time, is_booked
  - unique constraint on `(slot_date, slot_time)`
  - indexed for date/booked queries
  - audit columns

- `bookings`
  - id (uuid), booking_type, slot_date, slot_time
  - duration_mins, package_id (FK), pay_method
  - grand_total, receipt_id (unique), customer_email
  - status, payment_method
  - audit columns

Schema quality:

- Constraints for enums/check values.
- Uniqueness for receipt and slot identity.
- FK from bookings.package_id to packages.id.
- Indexed columns for common lookups.

## 7. Booking Workflow

1. User chooses sport.
2. User chooses event/facility.
3. User selects date/time and package/duration.
4. User accepts terms.
5. User logs in if needed.
6. Checkout and pay method selected.
7. Backend attempts booking persistence.
8. UI receives success/cash outcome and renders final state.

Business behavior:

- Slot is marked booked when booking persists.
- Payment success is simulated with weighted outcome.
- API contract remains stable for frontend compatibility.

## 8. Configuration and Environment

Backend (`backend/.env`):

- PORT
- FRONTEND_URL
- JWT_SECRET
- GOOGLE_CLIENT_ID
- DATABASE_URL
- DATABASE_SSL
- DATABASE_CONNECTION_TIMEOUT_MS
- DATABASE_POOL_MAX

Frontend (`frontend/.env.local`):

- VITE_API_BASE_URL
- VITE_GOOGLE_CLIENT_ID

## 9. Build and Run Commands

Backend:

- `npm run dev`
- `npm run build`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run db:smoke:slot-lock`

Frontend:

- `npm run dev`
- `npm run build`

Docker:

- `docker compose up --build`

## 10. Integration Notes

- Frontend calls backend APIs through `frontend/src/lib/api.ts`.
- Choose Your Sport data is fetched from `GET /api/sports` and falls back to the JSON reference files in `backend/src/data/json/sports.json` and `frontend/src/data/json/sports.json` when the DB/API is unavailable.
- Sport Events data is fetched from `GET /api/sports/:sportId/events` and falls back to the JSON reference files in `backend/src/data/json/sport-events.json` and `frontend/src/data/json/sport-events.json` when the DB/API is unavailable.
- Sport Facility data is fetched from `GET /api/sports/:sportId/facilities` and falls back to the JSON reference files in `backend/src/data/json/sport-facilities.json` and `frontend/src/data/json/sport-facilities.json` when the DB/API is unavailable.
- Token from login is sent as `Authorization: Bearer` on protected endpoints.
- Health endpoint includes DB configured state.
- With no `DATABASE_URL`, backend can still provide deterministic slot behavior for non-persistent demo mode.

## 11. Error Handling and Recovery

Common protections:

- API payload validation in routes.
- Auth middleware for protected operations.
- Transaction rollback on booking failures.
- DB bootstrap idempotency to avoid duplicate schema failures.

Operational checks:

- Call `/api/health` to validate service readiness.
- Run `db:migrate` after environment changes.
- Run `db:seed` to repopulate package and slot baseline data.

Demo identity:

- seeded user and seeded bookings default to `contact@ipasmo.com`.

## 12. Maintenance Checklist

When changing pricing/package logic:

- Update frontend constants as needed.
- Keep backend package source aligned with DB seed behavior.
- Verify checkout totals and API response compatibility.

When changing slot model:

- Update slot generation logic in `database.ts`.
- Verify schedule UI assumptions and slot key format.

When changing auth:

- Preserve token shape expected by frontend.
- Keep `authMiddleware` behavior consistent.

When changing API contracts:

- Update `frontend/src/types/index.ts` and `frontend/src/lib/api.ts` together.
- Build frontend and backend before release.

## 13. Security Notes

- Never commit real credentials.
- Use strong `JWT_SECRET` in non-dev environments.
- Keep service ports and CORS origins explicit.
- Use TLS-enabled DB connection strings for Neon.
- Keep sensitive values in platform secret managers.
