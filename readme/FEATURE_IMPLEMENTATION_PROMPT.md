# SportyGo Prompt Reference

## Use this in chat

```text
Refer to readme/FEATURE_IMPLEMENTATION_PROMPT.md.
Implement: [feature, bug, or change in plain language].
Do not commit or push. Validate the result and report changed files, checks, assumptions, and risks.
```

That is the complete prompt for normal work. Do not copy this file into chat. I should inspect the repository and find the relevant screens, routes, types, tables, and existing patterns myself.

## Add only if needed

```text
Role: [customer/admin/both]
Expected result: [one sentence]
Must preserve: [one sentence]
Evidence: [error, screenshot, device, viewport, or reproduction steps]
```

Only add these lines when the information is not obvious from the code or your request.

## Rules for every task

- Inspect first; preserve current user changes and existing behavior.
- Make the smallest focused change using existing project patterns.
- State the likely controlling code path before editing and validate it immediately after the first edit.
- Do not invent fallback data, expose secrets, perform unrelated refactors, or change production data without confirmation.
- Do not commit or push until I explicitly approve the exact file list.
- Report what was actually verified, separating automated, browser, deployment, and database checks.

## SportyGo defaults

- Availability is per `sport + facility + date + time`.
- Booking times use the existing `Asia/Singapore` behavior; clarify date-range boundaries when relevant.
- Preserve authorization, server validation, transactions, slot locks, and concurrent-request protection.
- For UI, match the nearest screen's shell, image/logo treatment, spacing, and responsive behavior.
- For payment, email, deployment, or database work, keep test/live mode, secrets, migrations, runtime configuration, and provider settings separate.

## Typical checks

```text
Frontend: cd frontend && npm run build && npm run lint
Backend: cd backend && npm run build
Worker: cd cloudflare/backend-worker && npm run typecheck
```

Run only the checks relevant to the change, plus the smallest relevant API, database, or browser check.

## Continue later

```text
Refer to readme/FEATURE_IMPLEMENTATION_PROMPT.md. Continue:
Goal: [one sentence] | Done: [files/behavior] | Blocker: [exact issue]
Last check: [command/result] | Next action: [one action]
```
