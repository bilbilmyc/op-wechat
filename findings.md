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

## Tech stack (actual after M2)

- Node 20+ / TypeScript strict
- Fastify (api + webhook)
- Prisma 5.22 (ORM)
- pg-boss 10 (queue + scheduler)
- Hand-rolled axios wrapper for WeChat API (no `wechaty`)
- Vite + React + TypeScript
- TanStack Query (server state) + Zustand (UI state) — not yet wired (M2 frontend)
- shadcn/ui + Tailwind + Radix (UI components) — not yet wired (M2 frontend)
- react-hook-form + zod (forms) — not yet wired (M2 frontend)
- React Router v6 — not yet wired (M2 frontend)
- @fastify/cookie + @fastify/session 10 (auth)
- **bcryptjs** (NOT bcrypt — see "Findings from implementation" below)
- pino (logging)
- AES-256-GCM via `node:crypto` for at-rest secrets (no third-party crypto lib)
- Vitest 1.6 (unit tests)
- Docker Compose (deployment), base image `node:20-slim` (Debian) with libssl1.1 hack — see below

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

## Findings from implementation (M2, 2026-06-26)

These are concrete decisions / traps surfaced while writing the M2 backend. Each is a real cost the next person will pay if it's not recorded.

### F1. Prisma 5.22 + Debian 12 needs libssl 1.1

Prisma 5.22's query engine (`libquery_engine-linux-arm64-openssl-1.1.x.so.node`) is built against libssl 1.1, not 3.0. On `node:20-slim` (Debian 12 / bookworm, libssl 3 only), the engine fails to load with `libssl.so.1.1: cannot open shared object file`.

**Fix in `apps/api/Dockerfile`:** add `libssl1.1` from the bullseye archive. The `bullseye-security` repo is dead (404); use only `http://archive.debian.org/debian bullseye main` and remove the source-list file after install.

**When this can be removed:** when Prisma is upgraded to 6.x, which has better OpenSSL detection and ships binaries for the right version.

### F2. `bcrypt` (native) is hostile to Docker multi-arch builds

`bcrypt@5.x` ships prebuilt `.node` binaries for the host platform. Inside a Debian slim container on Apple Silicon, the macOS arm64 binary fails to load with `Exec format error`. Even on linux-arm64, the prebuilt binary may not match the container's glibc / musl.

**Fix:** use `bcryptjs` (pure JS). The API is identical (`bcrypt.hash(plain, 12)`, `bcrypt.compare(plain, hash)`), and it works in any Node runtime. Slower (~250 ms per hash with cost 12 in v8) but for password hashing on a low-frequency endpoint this is fine. If we ever need to scale, swap to scrypt via `node:crypto`.

### F3. `@fastify/session` v10 does not save on manual property assignment

Setting `request.session.adminId = 'x'` does NOT, by itself, trigger the onResponse save hook in some setups. The result: login returns 200 with no `Set-Cookie` header, and the next request can't authenticate.

**Fix:** explicitly call `request.session.save(callback)` after assigning properties. Belt-and-suspenders: also set `saveUninitialized: true` so the session cookie is emitted on the first response regardless of @fastify/session's modified-tracking.

### F4. `@fastify/session` default `secure: 'auto'` + TLS proxy = Secure cookie over HTTP

The default for the session cookie's `secure` flag is `'auto'`, which derives from `request.protocol`. With `trustProxy: true` on Fastify and a TLS-terminating reverse proxy in front (even if our current nginx isn't doing TLS, the code path exists), the protocol can be reported as `https`, marking the cookie `Secure`. Over plain HTTP, curl / browsers drop the cookie, so the next request looks unauthenticated.

**Fix:** force `secure: false` in non-production. Use `process.env.NODE_ENV === 'production' ? 'auto' : false`.

### F5. `bcryptjs` and `bcrypt` types share the same name

After switching from `bcrypt` to `bcryptjs`, both `bcrypt` and `@types/bcryptjs` were accidentally installed at the workspace root, not in `apps/api`. `npm install <pkg>` at the repo root writes to the root `package.json`. Use `npm install -w apps/api <pkg>` to keep workspace boundaries clean.

### F6. Prisma `binaryTargets` must include the container's target

If you only put `native` in `binaryTargets`, the host generates the right binary but the container still has the wrong one baked into `node_modules/.prisma/client` (carried over via the `deps` stage of the Dockerfile). Always include the container's target explicitly (e.g. `debian-openssl-3.0.x`) and `rm -rf node_modules/.prisma` before `prisma generate` in the build to avoid stale binaries.

### F7. Docker build context: where `prisma generate` runs

`prisma generate` looks for `schema.prisma` in the current directory or `prisma/`. When the Dockerfile is run with `context: .` (the monorepo root) and `WORKDIR /repo`, the schema is at `apps/api/prisma/schema.prisma`. Pass `--schema=apps/api/prisma/schema.prisma` explicitly, or `cd apps/api` first.

## Risks (from spec §12, surfaced for plan awareness)

| Risk | Where in plan it shows up | Status |
|---|---|---|
| WeChat 5s webhook timeout | T3.4 must keep handler < 200ms; T3.9, T3.10 push heavy work to pg-boss | Open (M3) |
| access_token expiry per app | T2.7 token cache + T8.4 app health indicator + scheduler cron for proactive refresh | M2 backend: cache skeleton done, scheduler cron not wired |
| Broadcast rate limit | T7.4 rate-limiter per app | Open (M7) |
| Rule engine runaway | T6.6 per-message cap of 3 fires | Open (M6) |
| Schema migration with data | Prisma migrate; rollback via `migrate resolve` + manual SQL — documented in README | Open (M8) |
| 微信测试号 limitations | v1 feature set avoids template messages / restricted menu features; T8.9 README documents the gap | Open (M8) |
| Single-tenant assumption later blocks multi-tenant | `wechat_app_id` FKs on all tenant-scoped tables from day 1 — enforced in T2.1 schema | Resolved (M2) |
