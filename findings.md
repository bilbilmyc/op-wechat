# Findings: op-wechat MVP

> Research and decisions captured during planning. Updated as work progresses.
>
> Source of truth for design: `docs/superpowers/specs/2026-06-26-op-wechat-mvp-design.md`
> Source of truth for product: `.scratch/op-wechat-mvp/PRD.md`
> Source of truth for plan: `task_plan.md`

## Architecture (from spec §3)

- **3 backend processes**: `api` (port 3001), `webhook` (port 3002), `scheduler` (no HTTP, has /healthz).
- **PostgreSQL 16** as the only data store; pg-boss reuses it for queues.
- **SSE** for real-time UI updates; polling fallback if SSE drops.
- **Static SPA + nginx** as the only publicly exposed port.

## Data model (from spec §5)

11 tables. Key facts:
- All primary keys are UUID.
- All tenant-scoped tables have a `wechat_app_id` foreign key from day 1.
- `messages` is append-only; `conversations` is a denormalized aggregate upserted on every new message.
- `broadcast_targets` is its own table (not JSON) to support per-fan retry and rate limiting.
- Rule `trigger_config` and `action_config` are JSON for v1 flexibility.
- `agent_id` on messages is a FK to `admins` (every admin is also a customer-service agent in v1).

## Tech stack (from spec §4)

- Node 20+ / TypeScript strict
- Fastify (api + webhook)
- Prisma (ORM)
- pg-boss (queue + scheduler)
- Hand-rolled axios wrapper for WeChat API (no `wechaty`)
- Vite + React + TypeScript
- TanStack Query (server state) + Zustand (UI state)
- shadcn/ui + Tailwind + Radix (UI components)
- react-hook-form + zod (forms)
- React Router v6
- @fastify/cookie + @fastify/session (auth)
- bcrypt (password hashing)
- pino (logging)
- Vitest + Supertest (unit + API integration)
- Playwright (E2E)
- testcontainers (real PG in tests)
- Docker Compose (deployment)

## Key constraints

- **5-second webhook SLA.** Webhook returns 200 within 200ms target. Heavy work (rule firing, SSE fan-out) is queued via pg-boss.
- **Per-app isolation.** Every read/write/cache is scoped by `wechat_app_id`. No `WHERE 1=1` shortcuts.
- **`unionid` collected but not yet used.** v2 will bridge fans across apps using unionid.
- **单租户 in v1.** Multi-tenant is v2.

## Resolved decisions (from brainstorming session)

- **"op" meaning** — "open platform" (2026-06-26).
- **Multi-公众号 in v1** — yes, 2+ apps from day 1. v1 ships app switcher + per-app data isolation + per-app token/rule/broadcast/menu.
- **Cross-app fan linking** — v2.
- **Workflow engine** — v2.
- **多租户** — v2.
- **Mobile client** — v2.

## Skill substitutions

- The brainstorming SKILL.md references `writing-plans` as the next step, but `writing-plans` is not in the installed skills list.
- Substituted with `planning-with-files-zh` (the Chinese "Manus-style" file-based planning skill). Produces a `task_plan.md` with phases, tasks, acceptance criteria, and checkboxes — semantically equivalent for our purpose.
- The plan output (`task_plan.md`) is what the implementation work will follow; the underlying skill name is incidental.

## Open questions for the user (non-blocking)

- **Default admin credentials in seed**: `admin@example.com` / `admin123` — must be changed in production. Plan to add a setup script that forces password change on first login?
- **App-icon library on the frontend**: spec doesn't say. Defaulting to `lucide-react` (the de-facto shadcn/ui pairing).
- **License**: TBD. The plan calls this out as T8.11.
- **是否需要多语言**: the spec is in mixed Chinese/English; the UI is undecided. Defaulting to Chinese-only for v1 (matches the user's working language).

## Risks (from spec §12, surfaced for plan awareness)

| Risk | Where in plan it shows up |
|---|---|
| WeChat 5s webhook timeout | T3.4 must keep handler < 200ms; T3.9, T3.10 push heavy work to pg-boss |
| access_token expiry per app | T2.7 token cache + T8.4 app health indicator + scheduler cron for proactive refresh |
| Broadcast rate limit | T7.4 rate-limiter per app |
| Rule engine runaway | T6.6 per-message cap of 3 fires |
| Schema migration with data | Prisma migrate; rollback via `migrate resolve` + manual SQL — documented in README |
| 微信测试号 limitations | v1 feature set avoids template messages / restricted menu features; T8.9 README documents the gap |
| Single-tenant assumption later blocks multi-tenant | `wechat_app_id` FKs on all tenant-scoped tables from day 1 — enforced in T2.1 schema |
