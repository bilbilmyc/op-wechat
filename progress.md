# Progress Log: op-wechat MVP

> Session log for `op-wechat` planning + implementation. Each entry is one session.

---

## 2026-06-26 — Session 1: Spec + PRD + plan

**Context:** User has an empty GitHub repo (`bilbilmyc/op-wechat`), no local git, no source. Wants to build a wechat-related project but is unsure of direction. Initialized the local repo and added the GitHub remote as the first action.

**Setup:**
- Created `AGENTS.md` + `docs/agents/{issue-tracker, triage-labels, domain}.md` (engineering-skills config) via `/setup-matt-pocock-skills`.
- Issue tracking: local markdown (`.scratch/<feature>/`) — user isn't ready to commit to GitHub Issues yet.
- Single-context domain layout.

**Brainstorming via `/brainstorming`:**
- Resolved direction through 4 clarifying questions:
  1. WeChat sub-area → 公众号 + 开放平台
  2. Target users → self / SaaS / company
  3. v1 scope → all 4 modules at MVP (user picked the broadest option despite my flagging the risk)
  4. Tech stack → Node/TS + Vite/React + PostgreSQL
  5. WeChat account → 微信公众号 is being re-registered; v1 uses 微信测试号
- Resolved during spec review:
  - "op" = open platform
  - v1 = 2+ 公众号 from day 1 (multi-app UI ships in v1; cross-app fan linking remains v2)

**Design spec written** (`docs/superpowers/specs/2026-06-26-op-wechat-mvp-design.md`):
- §1 background + resolved decisions
- §2 v1 scope (4 modules × per-app)
- §3 architecture (3 processes, per-app routing)
- §4 tech stack
- §5 data model (11 tables)
- §6 key flows (5 flows including 5s SLA inbound)
- §7 error handling
- §8 testing strategy
- §9 deployment
- §10 milestones (M1-M8)
- §11 v2 deferrals
- §12 risks

**PRD written** (`.scratch/op-wechat-mvp/PRD.md`):
- §1 background
- §2 goals
- §3 non-goals
- §4 personas (operator primary, follower secondary)
- §5 user stories (5.1-5.5)
- §6 functional requirements (6.1-6.5)
- §7 non-functional requirements
- §8 success metrics
- §9 open risks
- §10 v2+ deferrals
- §11 related documents

**Implementation plan** (`task_plan.md`):
- 8 phases (M1-M8), ~50 tasks with file paths, dependencies, acceptance criteria, checkboxes.
- ~13.5 days estimated.

**Git state:**
- 5 commits on `main`, all local, not pushed:
  ```
  e395737 docs: add op-wechat-mvp PRD per issue-tracker convention
  7ca06dd docs: expand v1 scope to multi-公众号 from day 1
  9443265 docs: resolve op meaning as open platform; frame v2 direction
  ad74e2e chore: bootstrap repo with agents config and MVP design spec
  ```
  (Note: 5th commit will be added for plan/findings/progress files in this session.)

**Status:** Planning complete. Awaiting user direction on whether to start Phase 1 (M1 Skeleton) or push to GitHub first.

---

## 2026-06-26 — Session 2: Phase 1 (M1 Skeleton) implementation

**Context:** User chose to push existing 5 commits and start Phase 1 in this session. Docker Desktop was not running; launched via `open -a Docker`.

**Phase 1 acceptance criteria** (from `task_plan.md`):
> `docker compose up` brings up all services; `curl http://localhost/healthz` (nginx) and each backend `/healthz` return 200; SPA loads in browser.

**Work done:**

- Created root config: `package.json` (npm workspaces), `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `.env.example`, `README.md`
- Created `packages/shared` with `AppId` / `OpenId` / `UnionId` branded types and `WeChatError` class
- Created `apps/api` (Fastify + pino + error envelope + `/healthz`)
- Created `apps/webhook` (Fastify + `/webhook/:app_id` placeholder for both GET handshake and POST; + `/healthz`; XML content parser deferred to M3)
- Created `apps/scheduler` (pg-boss init + `/healthz`; returns 503 until pg-boss started)
- Created `apps/web` (Vite + React + TS; base `App.tsx` rendering Phase 1 placeholder; HMR working through nginx)
- Wrote `docker-compose.yml` (6 services) and `nginx/default.conf` (root `/healthz`, `/api/` and `/webhook/` reverse-proxied, `/` → Vite with WebSocket upgrade)
- Wrote a `Dockerfile` per backend app and a `Dockerfile` for `web` (Vite dev mode for Phase 1)

**Verification:**
- `npm install` → 301 packages, 38s
- `tsc --noEmit` → all 4 packages (api, webhook, scheduler, shared) clean
- `tsc --noEmit -p apps/web` → clean
- `npm run build -w apps/{api,webhook,scheduler}` → all 3 succeed
- `docker compose config` → valid
- `docker compose up -d` → all 6 containers healthy/started
- `curl /healthz` (nginx) → 200
- `curl /api/healthz` → 200 (JSON `{status,service,version,uptime_seconds}`)
- `curl /webhook/healthz` → 200 (JSON)
- `curl :3003/healthz` (scheduler) → 200
- `curl /` → HTML serving with Vite HMR script
- `curl /src/main.tsx` → JS serving (Vite dev pipeline working)

**Bug found and fixed during verification:**
- `proxy_pass http://api_upstream;` (no trailing slash) caused nginx to forward the full original URI, so `/api/healthz` hit the API as `/api/healthz` (404). Fix: add `/` to make it `proxy_pass http://api_upstream/;`, which makes nginx replace the matched `/api/` prefix with `/`.
- The webhook case was coincidentally returning 200 (the placeholder `/webhook/:app_id` route caught `healthz` as an `app_id`), masking the same bug. Same fix applied.

**Git state:**
- 7 commits on `main`, all pushed to GitHub:
  ```
  717685f fix(nginx): add trailing slash to proxy_pass for /api/ and /webhook/
  d4e7257 feat(phase-1): M1 Skeleton — monorepo + 3 backend processes + SPA
  091d42f plan: add task_plan.md, findings.md, progress.md (8-phase MVP plan)
  e395737 docs: add op-wechat-mvp PRD per issue-tracker convention
  7ca06dd docs: expand v1 scope to multi-公众号 from day 1
  9443265 docs: resolve op meaning as open platform; frame v2 direction
  ad74e2e chore: bootstrap repo with agents config and MVP design spec
  ```

**Status:** Phase 1 complete. Acceptance met. Stack is running at http://localhost. Ready to start Phase 2 (M2 — Schema + auth + app management) when user gives the go-ahead.

**Notes for next session:**
- The `.env` file with placeholder secrets was created from `.env.example`. For production, rotate `SESSION_SECRET` and `APP_ENCRYPTION_KEY` (note: rotating the latter requires re-encrypting all `wechat_apps.app_secret` rows).
- 7 npm audit vulnerabilities remain (mostly transitive in devDeps); deferred to M8 polish.
- `git status` is clean. To stop the running stack: `docker compose down`. To start: `docker compose up -d`.


(Subsequent sessions append entries below.)

---

## 2026-06-26 — Session 3: Phase 2 (M2) backend + bug fixes

**Context:** Phase 1 done. User asked to continue with Phase 2. The first 5 commits were pushed. Local git + Docker + Postgres all working. This session: write the M2 backend (Prisma schema, auth, apps CRUD, token cache, seed, vitest), then run TDD to find and fix real bugs.

### M2 backend written (`564a9e0`)

- Prisma schema with all 11 tables from spec §5, all tenant-scoped tables carrying `wechat_app_id` FK from day 1.
- `lib/crypto.ts` — AES-256-GCM encrypt/decrypt for `app_secret` and `encoding_aes_key` at rest.
- `lib/wechat-token-fetcher.ts` — axios wrapper for `/cgi-bin/token`.
- `plugins/prisma.ts` — Prisma client + `onClose` disconnect.
- `plugins/auth.ts` — `@fastify/cookie` + `@fastify/session`, `app.authenticate` preHandler.
- `plugins/wechat-token-cache.ts` — per-app LRU + DB-backed, inflight coalesce.
- `routes/auth.ts` — `/auth/login`, `/auth/logout`, `/auth/me`.
- `routes/admins.ts` — list.
- `routes/apps.ts` — full CRUD on `wechat_apps` with encrypt-on-write.
- `prisma/seed.ts` — default admin + sample app.
- `vitest.config.ts` + 4 crypto unit tests.
- 1 initial migration `20260626030027_init` applied to the dev DB.

**Initial verification (rejected)**: built and ran the API container, but it crashed with `PrismaClientInitializationError: libssl.so.1.1: No such file or directory`. Prisma 5.22's query engine is built against libssl 1.1; Debian 12 slim only ships libssl 3. Resolved by adding a one-shot `RUN` in `apps/api/Dockerfile` that pulls `libssl1.1` from the bullseye archive repo (Debian 11).

### TDD round (`740ab2a`)

Per the user's request to "先检查一下当前的代码是否bug很多，先修复修复", ran TDD to find and fix real bugs.

- **Exported** `WechatTokenCache` class (was un-testable in isolation).
- Added `test/auth.test.ts` (4 tests), `test/wechat-token-cache.test.ts` (7 tests), `test/crypto-env.test.ts` (3 tests). 18/18 passing.
- Found and fixed two real bugs:
  1. `apps/api` dev script ran `tsx watch` without first building the shared workspace package, so local dev failed to resolve `@op-wechat/shared`. Fixed dev script to run `npm run build -w @op-wechat/shared` first.
  2. `auth.ts` `authenticate` decorator used `(request: any, reply: any)` — replaced with `FastifyRequest` / `FastifyReply`.
- TDD also caught a test-design issue (concurrent-refresh test asserted on microtask timing); test was rewritten to verify end-state via `setImmediate` rather than microtask-counting.

### End-to-end run (`8ca07fb`)

User asked to fix the remaining bugs blocking actual API operation. Three more real bugs found and fixed:

1. **Prisma runtime OpenSSL mismatch** — already addressed via libssl 1.1 in Dockerfile. After rebuild with debian-slim, the API started successfully.
2. **No `Set-Cookie` on login response** — `@fastify/session` v10's onResponse save hook did not fire for the manual `request.session.adminId = ...` assignment. Fixed by:
   - Setting `saveUninitialized: true` (defensive).
   - Explicitly calling `request.session.save()` in the login handler (load-bearing fix).
3. **Cookie marked `Secure` over plain HTTP** — `@fastify/session` default `secure: 'auto'` reads `request.protocol`, which can be `https` when the request is forwarded by a TLS-terminating proxy. Fixed by forcing `secure: false` for non-production, with a comment.

### End-to-end verification (live)

```
=== /api/healthz ===          200 JSON
=== POST /api/auth/login ===  200 + Set-Cookie: sessionId=...; HttpOnly; SameSite=Lax
=== GET /api/auth/me ===      200 + admin user
=== GET /api/apps ===         200 + seed app
```

### Tests

- 18 unit tests pass (4 crypto, 4 auth, 7 token cache, 3 env).
- TypeScript typecheck clean across all 4 packages.

### Git state

11 commits on `main`, all pushed:

```
8ca07fb fix(phase-2): unblock api container — libssl 1.1 + explicit session save
740ab2a test(phase-2): cover password hashing, token cache, crypto env; fix two real bugs
564a9e0 feat(phase-2): M2 backend — Prisma schema, auth, apps CRUD, token cache
a4c7e47 docs: log Phase 1 completion in progress.md
717685f fix(nginx): add trailing slash to proxy_pass
d4e7257 feat(phase-1): M1 Skeleton
091d42f plan: add task_plan.md, findings.md, progress.md
e395737 docs: add op-wechat-mvp PRD
7ca06dd docs: expand v1 scope to multi-公众号
9443265 docs: resolve op meaning as open platform
ad74e2e chore: bootstrap repo
```

### Outstanding work

- **Phase 2 frontend** (T2.8–T2.13): api client, auth hooks, Login page, AppShell, Settings/Apps, activeApp store.
- **Phase 2 apps routes integration test** (task #27, optional): testcontainers + real PG.
- **Phases 3–8**: inbound pipeline, outbound reply, fan mgmt, auto-reply rules, broadcast, polish.

### Notes for next session

- The seed admin is `admin@example.com` / `admin123` — change before any non-local use.
- The Prisma libssl-1.1 hack in `apps/api/Dockerfile` is annotated; remove when Prisma is upgraded to 6.x.
- 12 npm audit vulnerabilities remain (mostly transitive devDeps); deferred to M8 polish.
- For dev iteration: stop the API container and run `npm run dev:api` from the host (after `docker compose up postgres`); saves a full container rebuild per code change.
