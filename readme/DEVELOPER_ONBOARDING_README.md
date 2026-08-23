# SportyGo Booking App - Beginner Developer Guide

Welcome to the SportyGo project. This guide explains how to prepare your computer, download the project, run it, understand the code, and make your first change.

This guide assumes Windows and VS Code, but the project also works on macOS and Linux with small command changes.

## 1. What You Are Building

SportyGo is a sports facility and coaching booking application.

A customer can:

- Create an account or log in.
- Choose a sport such as cricket, badminton, soccer, volleyball, basketball, kabaddi, pickleball, or indoor cricket.
- Browse sport events, facilities, and coaching options.
- Select a date, time slot, and duration.
- Review booking terms.
- Pay by card through Stripe or use the enabled mock payment option during development.
- View a booking confirmation and booking history.
- View and update profile information.
- Request a password-reset passcode by email.

The application has three main parts:

| Part | Technology | Purpose |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | What the customer sees and clicks in the browser |
| Backend | Node.js, Express, TypeScript | API, authentication, booking rules, payments, and email |
| Database | PostgreSQL, usually Neon | Stores users, sports, facilities, slots, bookings, packages, and configuration |

## 2. Before You Start

### Required accounts and equipment

You should have:

- A working email account for project communication and password-reset testing.
- A GitHub account and permission to access the repository.
- A mobile number for project-related communication and meeting contact.
- A laptop or desktop computer that can run Node.js, VS Code, and a local development server.
- A stable internet connection for GitHub, package installation, database access, Stripe, and email services.
- Permission to install software on the computer, or help from your IT administrator.

### Suggested minimum computer requirements

These are practical minimums for comfortable development:

- 64-bit Windows 10 or Windows 11, macOS, or a modern Linux distribution.
- Intel Core i5 / AMD Ryzen 5 equivalent or better.
- 8 GB RAM minimum; 16 GB is recommended when running VS Code, a browser, database tools, and two development servers.
- At least 10 GB of free disk space for the project, Node packages, build output, and optional Java/FakeSMTP tools.
- A screen resolution of at least 1366 x 768.
- A modern browser such as Chrome or Edge.

### Optional communication tools

The project team may use Zoom or Webex for meetings, screen sharing, and support. Install one if your team requires it; it is not needed to run the application.

### Optional email testing tool

FakeSMTP can be used when developers want to test email locally without sending real email.

- FakeSMTP requires Java/JDK 1.8.
- Install a JDK 8-compatible distribution only if your team uses FakeSMTP.
- Do not install Java just to run the SportyGo application.
- When FakeSMTP is used, the backend SMTP host, port, user, password, and sender must match the FakeSMTP setup.
- Never commit real SMTP passwords or API keys to GitHub.

## 3. Install Required Software

Install these tools before cloning the project:

1. **Git**: https://git-scm.com/downloads
2. **Node.js 22 LTS**: https://nodejs.org/
3. **Visual Studio Code**: https://code.visualstudio.com/
4. **Google Chrome or Microsoft Edge** for browser testing.
5. **Optional: JDK 1.8 and FakeSMTP** for local email testing.

### Recommended Node.js version

Use **Node.js 22 LTS** for this project. Node.js 20.19 or newer is also suitable for the current Vite toolchain.

After installing Node.js, open a new PowerShell window and check:

```powershell
node --version
npm --version
```

You should see a Node 22 version and an npm version. If PowerShell blocks `npm.ps1` because of its execution policy, use `npm.cmd` in commands, for example:

```powershell
npm.cmd --version
```

### Check Git

```powershell
git --version
```

## 4. Clone the GitHub Project

A Git repository is the project folder plus its history. Git lets developers work on separate branches, review changes, and combine work safely.

Open PowerShell and choose a parent folder such as `D:\Projects`:

```powershell
Set-Location D:\Projects
git clone https://github.com/ipasmo/sg-booking-app.git
Set-Location .\sg-booking-app
```

If your team gives you a different repository URL, use that URL instead.

Check that the project was downloaded:

```powershell
Get-ChildItem
git status
```

You should see folders such as `frontend`, `backend`, and `readme`.

## 5. Git Basics for Daily Work

### See branches

```powershell
git branch
git branch --all
```

The branch with an asterisk is your current branch.

### Create a feature branch

Always create a branch for a feature or bug fix. Do not work directly on `main` unless your lead specifically asks you to.

```powershell
git switch main
git pull origin main
git switch -c feature/short-description
```

Examples:

```powershell
git switch -c feature/forgot-password-email
git switch -c fix/stripe-https-warning
git switch -c docs/beginner-setup-guide
```

Use lowercase words separated by hyphens. Keep the branch name short and meaningful.

### Check your work

```powershell
git status
git diff
```

`git diff` shows changes that are not staged yet.

### Stage changes

Stage one file:

```powershell
git add frontend/src/screens/CheckoutScreen.tsx
```

Stage several known files:

```powershell
git add backend/src frontend/src
```

Stage all changed files only when you have reviewed them:

```powershell
git add .
```

Check what is staged:

```powershell
git diff --cached
```

### Commit changes

A commit is a saved checkpoint in Git history.

```powershell
git commit -m "Add Stripe HTTPS guard"
```

Write commit messages as short action statements, such as `Fix password reset email loading` or `Add beginner setup guide`.

### Push a branch to GitHub

The first push connects your local branch to the remote branch:

```powershell
git push -u origin feature/short-description
```

Later pushes use:

```powershell
git push
```

### Update your branch with the latest main branch

Before starting work or opening a pull request:

```powershell
git fetch origin
git switch main
git pull origin main
git switch feature/short-description
git merge main
```

If Git reports a conflict, do not guess. Ask the project lead, explain which files conflict, and resolve the conflict together.

### Pull request checklist

Before opening a pull request:

- `git status` shows only intended changes.
- The frontend build passes.
- The backend build passes.
- You tested the affected user flow.
- No `.env`, passwords, API keys, Stripe secret keys, or SMTP credentials are included.
- The pull request description explains what changed and how it was tested.

## 6. Install and Configure VS Code

1. Download and install VS Code from https://code.visualstudio.com/.
2. During installation, enable **Add to PATH** if the option is shown.
3. Open VS Code.
4. Install these extensions from the Extensions view (`Ctrl+Shift+X`):
   - ESLint
   - Prettier - Code formatter, if used by your team
   - GitLens, optional
   - PostgreSQL or a database extension, optional
5. Open the project folder with **File > Open Folder**.

Useful VS Code shortcuts:

| Shortcut | Purpose |
| --- | --- |
| `Ctrl+P` | Find and open a file |
| `Ctrl+Shift+P` | Open the command palette |
| `Ctrl+Shift+F` | Search the project |
| `Ctrl+`` | Open the integrated terminal |
| `Ctrl+S` | Save the current file |
| `Ctrl+Shift+G` | Open Source Control |

## 7. Import the Project into VS Code

From PowerShell:

```powershell
Set-Location D:\Projects\sg-booking-app
code .
```

If the `code` command is not available:

1. Open VS Code manually.
2. Select **File > Open Folder**.
3. Select the `sg-booking-app` folder.
4. Open the integrated terminal with `Ctrl+``.

The project intentionally has separate dependency folders:

```text
sg-booking-app/
  frontend/    React browser application
  backend/     Express API and database services
  readme/      Project and deployment documents
```

There is no root `package.json`. Run frontend commands inside `frontend` and backend commands inside `backend`.

## 8. Create Local Environment Files

Environment files contain settings that change by machine or environment. They can contain secrets and must not be committed.

The example files contain placeholders only. Copy them to local files and replace the placeholders with values supplied by the project lead.

### Backend local environment

From the project root:

```powershell
Copy-Item backend\.env.example backend\.env
```

Open `backend/.env` and configure at least:

```dotenv
PORT=3001
FRONTEND_URL=http://localhost:5173
FRONTEND_URLS=http://localhost:5173
JWT_SECRET=use-a-long-random-local-secret
VITE_AUTH_PAYLOAD_KEY=use-the-same-key-as-frontend
PASSWORD_AT_REST_KEY=use-a-separate-local-secret
DATABASE_URL=postgresql://username:password@host/database?sslmode=require
DATABASE_SSL=true
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_POOL_MAX=10
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_CURRENCY=sgd
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=SportyGo <verified-sender@example.com>
```

Important:

- `VITE_AUTH_PAYLOAD_KEY` in the backend must match the frontend value exactly.
- `PASSWORD_AT_REST_KEY` is used to encrypt passwords stored in the database.
- `DATABASE_URL` is required for real database mode.
- `STRIPE_SECRET_KEY` must be a Stripe test secret key for local development.
- SMTP settings are required to send real password-reset and booking emails.
- Do not copy production secrets into a developer laptop unless explicitly approved.

### Frontend local environment

From the project root:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
```

Open `frontend/.env.local` and configure:

```dotenv
VITE_API_BASE_URL=http://localhost:3001
VITE_AUTH_PAYLOAD_KEY=use-the-same-key-as-backend
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
VITE_MOCK_PAYMENT_ENABLED=true
VITE_PAYMENT_TEST_PAGE_ENABLED=false
```

Frontend variables must begin with `VITE_` to be available in browser code. Never put a Stripe secret key, database password, SMTP password, or JWT signing secret in the frontend file.

## 9. Install the Frontend

Open a terminal in the project root:

```powershell
Set-Location frontend
npm.cmd install
```

Useful frontend commands:

```powershell
npm.cmd run dev       # Start Vite development server
npm.cmd run build     # Type-check and create frontend/dist
npm.cmd run preview   # Preview the production build locally
npm.cmd run lint      # Run ESLint
```

The development frontend normally starts at:

```text
http://localhost:5173
```

If you change `.env.local`, stop and restart the Vite server. Vite reads environment variables when it starts.

## 10. Install and Configure the Backend

Open a second terminal. Keep the frontend terminal running.

```powershell
Set-Location backend
npm.cmd install
```

Useful backend commands:

```powershell
npm.cmd run dev       # Start TypeScript API with automatic restart
npm.cmd run build     # Compile TypeScript into backend/dist
npm.cmd start         # Run the compiled production server
```

The development backend normally starts at:

```text
http://localhost:3001
```

The backend loads `backend/.env` when it starts. Restart the backend after changing environment values.

## 11. Set Up the Database

The application uses PostgreSQL. The team commonly uses Neon PostgreSQL, but another compatible PostgreSQL service may work if the connection supports the required features.

1. Create or obtain a PostgreSQL database.
2. Copy its connection string into `backend/.env` as `DATABASE_URL`.
3. Keep `DATABASE_SSL=true` for hosted databases such as Neon.
4. From the `backend` folder, run:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:smoke:slot-lock
```

What these commands do:

- `db:migrate` creates or updates the database schema.
- `db:seed` inserts sports, facilities, packages, events, and slot configuration data.
- `db:smoke:slot-lock` checks that two users cannot reserve the same slot at the same time.

To reset seedable local data and repopulate it:

```powershell
npm.cmd run db:reset:seed
```

Use reset commands carefully. They may delete local development data.

Check backend and database readiness:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

A healthy response contains `status: ok` and a database object. If `configured` is false, check `DATABASE_URL` and restart the backend.

## 12. Start the Application

Use two VS Code terminal panels.

### Terminal 1 - backend

```powershell
Set-Location backend
npm.cmd run dev
```

### Terminal 2 - frontend

```powershell
Set-Location frontend
npm.cmd run dev
```

Open the URL printed by Vite, normally:

```text
http://localhost:5173
```

The normal local request path is:

```text
Browser -> Vite frontend on port 5173 -> API on port 3001 -> PostgreSQL / Stripe / SMTP
```

### Optional Docker start

Docker runs the full local stack as containers:

```powershell
docker compose up --build
```

Docker URLs:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3001`

Stop Docker:

```powershell
docker compose down
```

Docker still needs a correctly configured `backend/.env` because the backend container reads that file.

## 13. Main Functional Requirements

### Authentication

- Register with email, name, mobile number, and password.
- Log in with email and password.
- Password payloads are encrypted in the browser before being sent to the backend.
- Backend encrypts password values at rest.
- Authenticated API calls use a JWT bearer token.
- Forgot password generates a six-digit passcode, stores it with a ten-minute expiry, and sends it through SMTP.

### Sports and catalog

- Sports are loaded from the backend database.
- Each sport can have event categories such as facility booking, academy, coaching, and gear.
- Facilities contain names, addresses, images, and pricing.
- Coaching packages contain package pricing and session information.

### Slot booking

- A customer selects a date, time, and duration.
- Available slots come from the backend.
- A slot can be temporarily reserved before payment.
- The database protects against double booking.
- A booking must use the authenticated user identity.

### Payments

- Stripe Elements collects card details in the browser.
- The backend creates a Stripe PaymentIntent using the secret key.
- The frontend confirms the payment using the publishable key.
- Test keys and test cards must be used during development.
- Mock payment is available only when `VITE_MOCK_PAYMENT_ENABLED=true`.
- Live Stripe keys require HTTPS in production.

### Booking and profile

- Successful bookings display a confirmation and receipt ID.
- Authenticated users can view booking history.
- Users can view profile information and log out.
- Email notifications can be sent for account welcomes, password resets, and booking confirmations when SMTP is configured.

## 14. Application User Flow

The normal customer journey is:

```mermaid
flowchart TD
    A[Open SportyGo] --> B[Home]
    B -->|Get Started| C[Choose Sport]
    B -->|Login| L[Login or Register]
    C --> D[Choose Event]
    D -->|Facility Booking| E[Choose Facility]
    D -->|Coaching| F[Choose Package]
    E --> G[Choose Date, Time, Duration]
    F --> G
    G --> H[Review Terms]
    H -->|Not logged in| L
    L --> I[Authenticated Session]
    I --> H
    H --> J[Checkout]
    J --> K{Payment method}
    K -->|Stripe card| P[Stripe PaymentIntent]
    K -->|Mock payment in development| M[Mock Payment]
    P --> N[Create Booking]
    M --> N
    N --> O[Booking Confirmation]
    O --> Q[View Bookings or Profile]
    L -->|Forgot password| R[Request email passcode]
    R --> S[Verify passcode]
    S --> T[Set new password]
    T --> L
```

Other navigation options include:

- **Explore**: sports, events, and facilities.
- **Academy**: sport event and coaching options.
- **My Bookings**: previous bookings, requires login.
- **Profile**: account information, requires login.

The `AppContext` navigation guards prevent invalid steps. For example, a user cannot open checkout without a selected date and time, and a user who is not logged in is sent to login before checkout.

## 15. How the Code Works: Browser to Database

The user asked about `index.js`. This project uses TypeScript, so the equivalent entry file is `frontend/src/main.tsx`.

```mermaid
sequenceDiagram
    participant Browser
    participant HTML as frontend/index.html
    participant Main as frontend/src/main.tsx
    participant App as App.tsx + AppContext
    participant Screen as Screen component
    participant API as frontend/src/lib/api.ts
    participant Server as backend/src/index.ts
    participant Route as backend/src/routes/*.ts
    participant DB as PostgreSQL
    participant Email as SMTP/Nodemailer
    participant Stripe as Stripe API

    Browser->>HTML: Loads the page
    HTML->>Main: Loads the Vite JavaScript module
    Main->>App: Creates React root and AppProvider
    App->>Screen: Renders the current screen
    Screen->>API: Calls a function such as login or createBooking
    API->>Server: Sends HTTP request to /api/*
    Server->>Route: Express matches the route
    Route->>DB: Reads or writes application data
    Route->>Email: Sends reset or booking email when required
    Route->>Stripe: Creates PaymentIntent when card payment is selected
    Route-->>API: Returns JSON response
    API-->>Screen: Returns data or an error
    Screen-->>Browser: Updates the visible page
```

### Frontend startup in simple terms

1. The browser loads `frontend/index.html`.
2. Vite loads `frontend/src/main.tsx`.
3. `main.tsx` creates the React root and wraps the application in `AppProvider`.
4. `App.tsx` reads the current screen from `AppContext`.
5. The matching screen component is rendered, such as `HomeScreen` or `CheckoutScreen`.
6. A button click calls a function in `frontend/src/lib/api.ts`.
7. `api.ts` sends an HTTP request to the backend.

### Backend startup in simple terms

1. Node runs `backend/src/index.ts` in development or `backend/dist/index.js` after a build.
2. Dotenv loads `backend/.env`.
3. Express, CORS, Helmet, JSON parsing, and cache headers are configured.
4. Route groups are registered under `/api`.
5. The server listens on port `3001`.
6. A request is matched to a route, such as `auth.ts`, `slots.ts`, `bookings.ts`, or `payments.ts`.
7. The route validates input and calls a library such as `database.ts`, `email.ts`, or `stripe.ts`.
8. The route returns a JSON response to the frontend.

### Important source locations

```text
frontend/
  index.html                  Browser HTML entry point
  src/main.tsx                React entry point
  src/App.tsx                 Screen selection and bottom navigation
  src/context/AppContext.tsx Shared state and navigation guards
  src/screens/                Customer-facing screens
  src/lib/api.ts              Frontend HTTP calls to the backend
  src/lib/authCrypto.ts       Password payload encryption
  src/lib/stripe.ts           Stripe browser initialization

backend/
  src/index.ts                Express server entry point
  src/routes/auth.ts          Register, login, profile, forgot password
  src/routes/sports.ts        Sports, events, and facilities
  src/routes/slots.ts         Slot availability and reservations
  src/routes/bookings.ts      Booking creation and history
  src/routes/payments.ts      Stripe PaymentIntent endpoints
  src/routes/packages.ts      Coaching package data
  src/lib/database.ts         PostgreSQL queries and transactions
  src/lib/email.ts            Nodemailer email messages
  src/lib/stripe.ts           Stripe server integration
  src/middleware/             Authentication middleware
  src/scripts/                Migration, seed, reset, and smoke scripts
```

## 16. Backend API Quick Reference

The backend base URL is `http://localhost:3001` in local development. All application endpoints start with `/api`.

| Method | Endpoint | Purpose | Login required |
| --- | --- | --- | --- |
| GET | `/api/health` | Check server and database configuration | No |
| GET | `/api/sports` | List sports | No |
| GET | `/api/sports/:sportId/events` | List sport events | No |
| GET | `/api/sports/:sportId/facilities` | List facilities | No |
| GET | `/api/packages` | List coaching packages | No |
| GET | `/api/slots?date=YYYY-MM-DD` | Get available slots | No |
| POST | `/api/auth/register` | Create an account | No |
| POST | `/api/auth/login` | Log in | No |
| GET | `/api/auth/profile` | Get current profile | Yes |
| POST | `/api/auth/forgot-password/request` | Send reset passcode | No |
| POST | `/api/auth/forgot-password/verify` | Verify reset passcode | No |
| POST | `/api/auth/forgot-password/reset` | Save new password | No |
| POST | `/api/slots/reserve` | Temporarily reserve a slot | Yes |
| POST | `/api/slots/release` | Release a slot reservation | Yes |
| GET | `/api/bookings` | Get current user's bookings | Yes |
| POST | `/api/bookings` | Create a booking | Yes |
| POST | `/api/payments/stripe/payment-intent` | Create a Stripe PaymentIntent | Yes |

Protected endpoints expect this HTTP header:

```text
Authorization: Bearer <jwt-token>
```

## 17. Testing Checklist for a New Developer

After setup, test in this order:

1. Open `http://localhost:5173` and confirm the home page loads.
2. Call `http://localhost:3001/api/health` and confirm the backend responds.
3. Open Explore and confirm sports load.
4. Open a sport and confirm events and facilities load.
5. Select a facility, date, time, and duration.
6. Register a local test account using a test email address.
7. Log out and log in again.
8. Open Forgot Password and request a passcode if SMTP is configured.
9. Select a payment method.
10. Use Stripe test mode and a Stripe test card if testing real checkout.
11. Confirm the booking appears in the confirmation screen and booking history.
12. Open Profile and confirm the profile details load.

Do not use a real customer account, live payment card, production password, or production email recipient during local testing.

## 18. Troubleshooting

### `npm` is not recognized or PowerShell blocks npm

Use `npm.cmd` instead of `npm`:

```powershell
npm.cmd install
npm.cmd run dev
```

If Node is not found, close and reopen VS Code after installing Node.js.

### Frontend cannot reach the backend

Check:

- Backend terminal is running on port `3001`.
- Frontend has `VITE_API_BASE_URL=http://localhost:3001`.
- Backend has `FRONTEND_URL=http://localhost:5173`.
- The backend health URL responds.
- Restart the frontend after changing `.env.local`.

### Database is not configured

Check `DATABASE_URL` in `backend/.env`, confirm the database is reachable, and restart the backend. Run the migration and seed commands again if the schema is missing.

### Forgot-password email does not arrive

Check:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` are set.
- The sender address is verified by the email provider.
- The backend terminal shows the email result or SMTP error.
- The message is not in spam or a provider suppression list.
- FakeSMTP is running if you intentionally configured local FakeSMTP.

The backend does not write application logs to a file by default. To capture development output:

```powershell
Set-Location backend
npm.cmd run dev 2>&1 | Tee-Object -FilePath forgot-password.log
```

Do not commit that log file if it contains email addresses or service errors.

### Stripe reports that live integrations require HTTPS

Use a `pk_test_...` key over `http://localhost` during development. Use a `pk_live_...` key only when the frontend is served over HTTPS. Never place `sk_test_...` or `sk_live_...` in frontend files.

### Port is already in use

Find the process using a port:

```powershell
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
```

Stop only the process you understand, or ask the project lead before changing ports. The frontend Vite port and backend CORS settings must remain aligned.

### TypeScript build fails

Run the build from the correct folder:

```powershell
Set-Location frontend
npm.cmd run build

Set-Location ..\backend
npm.cmd run build
```

Read the first error carefully. Fix the first relevant error, then run the build again.

## 19. Developer Safety Rules

- Never commit `.env`, `.env.local`, passwords, database URLs, SMTP passwords, Stripe secret keys, or JWT secrets.
- Use Stripe test keys and test cards for development.
- Use test email addresses and local or approved SMTP accounts.
- Do not copy customer data into screenshots, GitHub issues, or chat messages.
- Do not change database seed or reset scripts without checking with the project lead.
- Do not edit production deployment settings while learning local development.
- Use a feature branch for each change.
- Keep commits small and explain what was changed.
- Ask for help when Git reports a merge conflict or when a database command may delete data.

## 20. Suggested First Week for a New Developer

### Day 1 - Setup

- Install Git, Node.js, and VS Code.
- Clone the repository.
- Install frontend and backend packages.
- Create local environment files.
- Start both servers.
- Open the application and call the health endpoint.

### Day 2 - Understand the frontend

- Read `frontend/src/main.tsx`.
- Read `frontend/src/App.tsx`.
- Read `frontend/src/context/AppContext.tsx`.
- Open one screen and follow its imports into `frontend/src/lib/api.ts`.
- Use the browser Developer Tools Network tab to watch an API request.

### Day 3 - Understand the backend

- Read `backend/src/index.ts`.
- Read one route file, such as `backend/src/routes/sports.ts`.
- Follow the route into `backend/src/lib/database.ts`.
- Call `/api/health` and one catalog endpoint.

### Day 4 - Make a small change

- Create a feature branch.
- Change a small label or validation message.
- Run the frontend build.
- Test the affected screen.
- Commit and push the branch.

### Day 5 - Walk through a booking

- Test sports, facility, slot, login, checkout, and confirmation.
- Review the browser Network tab.
- Review the backend terminal output.
- Write down one question about the architecture and discuss it with the project lead.

## 21. Where to Ask for Help

When reporting a problem, include:

- What you were trying to do.
- The exact command or URL.
- The first error message.
- Which terminal showed the error.
- Whether frontend, backend, database, Stripe, or email was involved.
- What you already tried.
- Do not include passwords, secret keys, full database URLs, reset codes, or customer data.

A useful report looks like:

```text
I was testing forgot password on the frontend.
The request was POST /api/auth/forgot-password/request.
The browser showed HTTP 500.
The backend terminal showed an SMTP authentication error.
I confirmed the backend health endpoint returns status ok.
I did not include any credentials in this report.
```

This is the fastest way for another developer to reproduce and fix the problem.
