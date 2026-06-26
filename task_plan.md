# Implementation Plan: op-wechat MVP

> Single source of truth for "what to build next" on `op-wechat`. Updated as work progresses.
>
> Source of truth for design: `docs/superpowers/specs/2026-06-26-op-wechat-mvp-design.md`
> Source of truth for product: `.scratch/op-wechat-mvp/PRD.md`

## Goal

Ship op-wechat v1: a self-hostable, multi-公众号 operations backend with **5 cross-cutting modules** — app management, fan management, customer-service reply, mass broadcast, auto-reply rules — on the architecture decided in the spec.

## Top-level constraints (must hold for every task)

- **Per-app isolation from day 1.** Every read / write / queue / cache is scoped by `wechat_app_id`. No `WHERE 1=1` shortcuts.
- **Webhook 5s SLA.** Webhook returns 200 within 200ms; heavy work is queued via pg-boss.
- **TS strict mode** in all Node/TS code. No `any` without comment.
- **Lint + format clean** before commit.
- **Tests accompany code** — unit for business logic, integration for endpoints, mock server for WeChat API.

## Project layout (target)

```
/
├── apps/
│   ├── api/             ← Fastify API server (port 3001)
│   ├── webhook/         ← Fastify inbound receiver (port 3002)
│   ├── scheduler/       ← pg-boss workers (no HTTP)
│   └── web/             ← Vite + React SPA
├── packages/
│   └── shared/          ← Shared types, zod schemas, WeChat crypto
├── nginx/               ← nginx config
├── docker-compose.yml
├── .env.example
├── package.json         ← npm workspaces root
├── tsconfig.base.json
├── eslint.config.js
├── .prettierrc
├── README.md
├── AGENTS.md
├── docs/
└── .scratch/
```

---

## Phase 1 — M1 Skeleton (foundation, no business logic yet)

**Status:** pending

- [ ] **T1.1** Init npm workspaces root: `package.json` with `workspaces: ["apps/*", "packages/*"]`
- [ ] **T1.2** Add `tsconfig.base.json` (target ES2022, module NodeNext, strict, paths)
- [ ] **T1.3** Add ESLint flat config + Prettier
- [ ] **T1.4** Create `apps/api` skeleton: Fastify app, pino logger, `setErrorHandler` returning `{code,message,details}`, `/healthz`
- [ ] **T1.5** Create `apps/webhook` skeleton: Fastify app, `/healthz`, route placeholder `/webhook/:app_id` returning 200
- [ ] **T1.6** Create `apps/scheduler` skeleton: node entrypoint, `/healthz` (HTTP for liveness), pg-boss init
- [ ] **T1.7** Create `apps/web` skeleton: Vite + React + TS, base layout with `App.tsx` rendering "op-wechat", `/healthz` (Vite serves `/healthz.json` static)
- [ ] **T1.8** Create `packages/shared` skeleton: exports `AppId` branded type, `WeChatError` class
- [ ] **T1.9** Write `docker-compose.yml` with services: `postgres` (postgres:16-alpine), `api`, `webhook`, `scheduler`, `web` (Vite dev for now, build for prod), `nginx`
- [ ] **T1.10** Write `nginx/default.conf`: serve SPA on `/`, reverse-proxy `/api/*` → `api:3001`, `/webhook/*` → `webhook:3002`
- [ ] **T1.11** Write `.env.example` with placeholder envs (POSTGRES_*, SESSION_SECRET, APP_ENCRYPTION_KEY)
- [ ] **T1.12** Write `README.md` quickstart: `cp .env.example .env && docker compose up`

**Acceptance:** `docker compose up` brings up all services; `curl http://localhost/healthz` (nginx) and each backend `/healthz` return 200; SPA loads in browser.

**Estimated effort:** ~1 day

---

## Phase 2 — M2 Schema + auth + app management

**Status:** pending

**Depends on:** Phase 1

- [ ] **T2.1** Add `apps/api/prisma/schema.prisma` with all 11 tables from spec §5
- [ ] **T2.2** Run `prisma migrate dev --name init` to generate SQL migration
- [ ] **T2.3** Add `apps/api/src/plugins/prisma.ts` (Fastify plugin, decorates `fastify.prisma`)
- [ ] **T2.4** Add `apps/api/src/plugins/auth.ts` (session via `@fastify/cookie` + `@fastify/session`); `POST /api/auth/login` (email+password → bcrypt), `POST /api/auth/logout`, `GET /api/auth/me`
- [ ] **T2.5** Add `apps/api/src/routes/admins.ts`: `GET /api/admins` (list, admin-only)
- [ ] **T2.6** Add `apps/api/src/routes/apps.ts` (CRUD on `wechat_apps`): `GET /api/apps`, `POST /api/apps`, `GET /api/apps/:id`, `PATCH /api/apps/:id`, `DELETE /api/apps/:id`. Encrypt `app_secret` and `encoding_aes_key` at write using `APP_ENCRYPTION_KEY`
- [ ] **T2.7** Add `apps/api/src/plugins/wechat-token-cache.ts`: in-memory LRU keyed by `app_id`, refreshes from DB, exposes `getToken(appId)`. DB-backed fallback in `wechat_apps` table (add `access_token`, `token_expires_at` columns via migration)
- [ ] **T2.8** Frontend: `apps/web/src/lib/api.ts` (typed fetch wrapper, includes `X-App-Id` header from Zustand store)
- [ ] **T2.9** Frontend: `apps/web/src/lib/auth.ts` (TanStack Query hooks for login/logout/me, Zustand session store)
- [ ] **T2.10** Frontend: `apps/web/src/pages/Login.tsx` (form with react-hook-form + zod)
- [ ] **T2.11** Frontend: `apps/web/src/components/AppShell.tsx` (top nav, app switcher dropdown, user menu)
- [ ] **T2.12** Frontend: `apps/web/src/pages/Settings/Apps.tsx` (list, add, edit, disable, delete apps — modal forms)
- [ ] **T2.13** Frontend: `apps/web/src/stores/activeApp.ts` (Zustand: current `appId`, persisted to localStorage, sent as `X-App-Id` header)
- [ ] **T2.14** Seed script: `apps/api/prisma/seed.ts` creating one admin (`admin@example.com` / `admin123` — change in prod) and a sample `wechat_apps` row
- [ ] **T2.15** Vitest setup: `apps/api/vitest.config.ts`, sample test for `wechat-token-cache`

**Acceptance:** Admin can log in; settings page lists/adds/edits/deletes `wechat_apps`; app switcher in top nav switches the active `appId`; the `X-App-Id` header is sent on every API call.

**Estimated effort:** ~2 days

---

## Phase 3 — M3 Inbound pipeline (webhook → messages → inbox read-only)

**Status:** pending

**Depends on:** Phase 2

- [ ] **T3.1** `packages/shared/src/wechat/signature.ts`: `verifySignature(token, timestamp, nonce, signature, encryptedEcho)`, `decryptMessage(encodingAesKey, ciphertext)`, `encryptMessage(...)` (for echo on encrypted mode)
- [ ] **T3.2** `packages/shared/src/wechat/xml.ts`: `parseInboundXml(xml)`, `buildResponseXml(fromUser, toUser, content)`, exhaustive Zod schema for inbound message types (text/image/voice/video/event/link/location)
- [ ] **T3.3** `apps/webhook/src/server.ts`: full Fastify app, body parser for XML, route `POST /webhook/:app_id`
- [ ] **T3.4** `apps/webhook/src/handlers/message.ts`: implement Flow 1 (resolve app, verify signature, parse XML, decrypt, persist, 200, enqueue `rule.evaluate` + `sse.fanout`)
- [ ] **T3.5** `apps/webhook/src/handlers/event.ts`: handle `subscribe` / `unsubscribe` / `CLICK` events (upsert fan, update `subscribe_status`, write event message)
- [ ] **T3.6** `apps/webhook/src/services/fan-upsert.ts`: upsert fan from inbound (openid from XML, unionid from XML if present, defaults for unknown)
- [ ] **T3.7** `apps/api/src/routes/messages.ts`: `GET /api/messages?fanId=&before=&limit=` (paged, descending), `GET /api/conversations` (per-app inbox)
- [ ] **T3.8** `apps/api/src/plugins/sse.ts`: SSE endpoint `GET /api/events/stream`; auth via session; events: `message.new`, `conversation.update`
- [ ] **T3.9** `apps/scheduler/src/queues/rule-evaluate.ts`: pg-boss queue, placeholder handler (logs and inserts `rule_executions` row with `success=false`, to be filled in Phase 6)
- [ ] **T3.10** `apps/scheduler/src/queues/sse-fanout.ts`: pg-boss queue, fetches active SSE connections, pushes event
- [ ] **T3.11** Frontend: `apps/web/src/pages/Inbox.tsx` (conversation list from `GET /api/conversations`)
- [ ] **T3.12** Frontend: `apps/web/src/pages/Conversation.tsx` (message list, infinite scroll, SSE subscription for new messages)
- [ ] **T3.13** Integration test: `apps/webhook/test/inbound.test.ts` using fastify.inject with a real test app and PG testcontainer; covers text / image / subscribe / unsubscribe / signature-fail
- [ ] **T3.14** Manual test: use 微信测试号, send a message, see it in the inbox within 1s

**Acceptance:** Sending a text / image / subscribe from 微信测试号 results in a new conversation row and message in the admin inbox; signature failure is rejected with 401; webhook returns 200 within 200ms.

**Estimated effort:** ~2 days

---

## Phase 4 — M4 Outbound reply (admin → 客服消息 → fan)

**Status:** pending

**Depends on:** Phase 3

- [ ] **T4.1** `packages/shared/src/wechat/client.ts`: axios wrapper with token injection (reads from `wechat-token-cache` via internal API or in-process if scheduler is in same process), retries on 5xx, refresh-on-401
- [ ] **T4.2** `apps/api/src/routes/messages.ts`: `POST /api/messages` (outbound) — insert `direction=outbound, status=sending`, call WeChat 客服消息 API, update status
- [ ] **T4.3** `apps/api/src/routes/media.ts`: `POST /api/media/upload` (multipart) — upload to WeChat `/cgi-bin/media/upload`, return `media_id`
- [ ] **T4.4** `apps/scheduler/src/queues/message-send-retry.ts`: pg-boss queue for failed sends (manual trigger or auto with backoff cap)
- [ ] **T4.5** Frontend: `apps/web/src/components/ReplyBox.tsx` (text + image, optimistic insert, status indicator)
- [ ] **T4.6** Frontend: `apps/web/src/hooks/useConversation.ts` (TanStack Query infinite query + SSE subscription)
- [ ] **T4.7** Unit test: `apps/api/test/services/message-send.test.ts` (mocked WeChat client, success + failure paths)
- [ ] **T4.8** Manual test: reply from inbox, verify fan receives message in WeChat

**Acceptance:** Admin can reply text and image to a fan from the conversation view; the fan receives the reply in WeChat within 2s; status reflects `sent` or `failed`; SSE pushes the new outbound message to all open clients.

**Estimated effort:** ~1.5 days

---

## Phase 5 — M5 Fan management (per-app)

**Status:** pending

**Depends on:** Phase 3 (fans exist); T4 (for tag-media in replies is independent)

- [ ] **T5.1** `apps/api/src/routes/fans.ts`: `GET /api/fans?search=&tagId=&status=&page=` (paged, per-app), `GET /api/fans/:id`, `PATCH /api/fans/:id` (remark), `GET /api/fans/:id/messages` (paged)
- [ ] **T5.2** `apps/api/src/routes/tags.ts`: `GET /api/tags`, `POST /api/tags` (sync to WeChat), `PATCH /api/tags/:id`, `DELETE /api/tags/:id`, `POST /api/fans/:id/tags` (assign, syncs), `DELETE /api/fans/:id/tags/:tagId`
- [ ] **T5.3** `apps/api/src/services/wechat-tags.ts`: wrappers for WeChat `/cgi-bin/tags/*` (create / update / delete / get / fans-batchtag) with retry
- [ ] **T5.4** `apps/scheduler/src/queues/tag-sync.ts`: pg-boss queue for failed tag-syncs; max 3 retries
- [ ] **T5.5** Frontend: `apps/web/src/pages/Fans.tsx` (list, search, filter by tag, link to detail)
- [ ] **T5.6** Frontend: `apps/web/src/pages/FanDetail.tsx` (profile, tag list, remark edit, message history tab)
- [ ] **T5.7** Frontend: `apps/web/src/components/TagManager.tsx` (create / rename / delete tags, assign / unassign)
- [ ] **T5.8** Integration test: tag CRUD round-trip (mocked WeChat)
- [ ] **T5.9** Manual test: create a tag in admin → verify in 微信公众平台; assign to a fan → verify in WeChat

**Acceptance:** Fan list shows all fans of the active app; filtering by tag works; editing remark persists; tag CRUD syncs to WeChat within 2s; assigning / unassigning a tag syncs.

**Estimated effort:** ~1.5 days

---

## Phase 6 — M6 Auto-reply rules

**Status:** pending

**Depends on:** Phase 3 (rule.evaluate queue from M3); T4 (outbound message API for reply actions)

- [ ] **T6.1** `apps/api/src/routes/rules.ts`: full CRUD on `rules`. Trigger config form schemas (zod) per `trigger_type`
- [ ] **T6.2** `apps/api/src/routes/rule-executions.ts`: `GET /api/rule-executions?ruleId=&fanId=&page=`
- [ ] **T6.3** `packages/shared/src/rule-engine/`: extract `evaluate(rules, message) → matchedRule[]` as a pure function (no DB / no side effects) for unit testability
- [ ] **T6.4** `packages/shared/src/rule-engine/keyword.ts`: `matchKeyword(rule, message) → boolean` for exact / fuzzy / regex
- [ ] **T6.5** `apps/scheduler/src/queues/rule-evaluate.ts`: replace M3 placeholder with: load enabled rules for app, evaluate, execute action via outbound message API, write `rule_executions` row
- [ ] **T6.6** `apps/scheduler/src/queues/rule-evaluate.ts`: enforce per-message cap of 3 rule fires
- [ ] **T6.7** Frontend: `apps/web/src/pages/Rules.tsx` (list, sortable by priority, enable/disable toggle)
- [ ] **T6.8** Frontend: `apps/web/src/pages/RuleEdit.tsx` (form with conditional fields by trigger_type, action_type)
- [ ] **T6.9** Frontend: `apps/web/src/pages/RuleExecutions.tsx` (log viewer, filterable)
- [ ] **T6.10** Frontend: "Test rule" button on `RuleEdit` — fires a synthetic inbound message through the engine and shows the matched action
- [ ] **T6.11** Unit test: `packages/shared/test/rule-engine.test.ts` (covers all trigger types, keyword variants, priority, stop_propagation)
- [ ] **T6.12** Manual test: subscribe from test 公众号 → receive welcome reply; send keyword → receive auto-reply; verify execution log

**Acceptance:** A `subscribe` rule fires on subscribe events; keyword rules fire on matching messages; `priority` order is respected; execution log records every fire with success / error; per-message cap prevents runaway.

**Estimated effort:** ~2 days

---

## Phase 7 — M7 Broadcast

**Status:** pending

**Depends on:** Phase 4 (outbound), Phase 5 (fans/tags for targeting)

- [ ] **T7.1** `apps/api/src/routes/broadcasts.ts`: `POST /api/broadcasts` (create draft), `GET /api/broadcasts` (list, paged, filterable), `GET /api/broadcasts/:id` (with targets), `POST /api/broadcasts/:id/send` (immediate), `POST /api/broadcasts/:id/schedule` (set scheduled_at), `POST /api/broadcasts/:id/cancel` (only when status=draft|scheduled), `POST /api/broadcasts/:id/retry-failed` (re-queue failed targets)
- [ ] **T7.2** `apps/api/src/services/broadcast-targeter.ts`: given `target_type` + `target_filter`, returns the list of `fan_id`s
- [ ] **T7.3** `apps/scheduler/src/queues/broadcast-send.ts`: pull from queue, fetch targets in batches, call WeChat 群发 API per fan (with rate limiter), update `broadcast_targets.status`, update `broadcasts.counts`
- [ ] **T7.4** `apps/scheduler/src/services/rate-limiter.ts`: token bucket per app, default 50 fan/min
- [ ] **T7.5** `apps/scheduler/src/cron/scheduled-broadcasts.ts`: pg-boss schedule trigger, fires `broadcast.send` jobs at `scheduled_at`
- [ ] **T7.6** SSE events: `broadcast.progress`, `broadcast.complete`
- [ ] **T7.7** Frontend: `apps/web/src/pages/Broadcasts.tsx` (list, status pills, link to detail)
- [ ] **T7.8** Frontend: `apps/web/src/pages/BroadcastCompose.tsx` (content editor, target picker — all / tag / fan picker, schedule picker)
- [ ] **T7.9** Frontend: `apps/web/src/pages/BroadcastDetail.tsx` (progress bar, target table with statuses, retry button)
- [ ] **T7.10** Unit test: rate-limiter, targeter
- [ ] **T7.11** Manual test: compose + send to 1 fan; verify delivered; compose + schedule for 1 min later; verify delivered on time; compose with 5 fans, manually make 2 fail in mock, retry, verify

**Acceptance:** Compose + send-now delivers within 1 min for small lists; scheduled sends fire at the scheduled time; rate limiter caps at 50 fan/min per app; per-fan status visible in real time; manual retry of failed targets works.

**Estimated effort:** ~2 days

---

## Phase 8 — M8 Polish + docs

**Status:** pending

**Depends on:** Phases 2-7

- [ ] **T8.1** Frontend: error boundary at the App level
- [ ] **T8.2** Frontend: empty states for every list page (Inbox, Fans, Broadcasts, Rules)
- [ ] **T8.3** Frontend: 404 / 500 pages
- [ ] **T8.4** Frontend: settings page sections — change password, app health (token status, last webhook received, last 24h message count)
- [ ] **T8.5** Backend: `GET /api/dashboard/summary` — message count last 24h, fan count, broadcast queue depth, last 5 inbound messages
- [ ] **T8.6** Frontend: `apps/web/src/pages/Dashboard.tsx`
- [ ] **T8.7** WeChat API mock server: `packages/wechat-mock/` standalone Fastify app, canned responses, failure simulation; used in integration tests
- [ ] **T8.8** Playwright: 1 E2E test (subscribe via mock → see in inbox → reply → see outbound)
- [ ] **T8.9** README: full feature list, screenshots, env reference, development setup, deployment, troubleshooting
- [ ] **T8.10** CHANGELOG: `0.1.0` entry
- [ ] **T8.11** License file (the user's call)
- [ ] **T8.12** Final sweep: kill all `any`, run lint, run all tests, run `docker compose up` from scratch, click through every page

**Acceptance:** Lint clean, all tests green, full E2E flow passes, README covers setup + usage, all 5 modules' acceptance criteria from PRD §8 are met.

**Estimated effort:** ~1.5 days

---

## Total estimate

~13.5 days of focused work for one developer. Realistic calendar time depends on the user's pace; this is a multi-week project at a comfortable pace, ~1 week at a sprint pace.

## Risks (from spec §12, called out for plan awareness)

- `writing-plans` was substituted with `planning-with-files-zh` because the former isn't installed. This is a tooling-only substitution; the plan content is what matters.
- WeChat 5s webhook timeout — Phase 3 implementation must keep webhook handler under 200ms target.
- `wechaty` rejected in spec — Phase 4 T4.1 builds the wrapper from scratch; this is more code but more controllable.

## How to use this plan

1. Open a phase, work its tasks top to bottom.
2. Check off a task by changing `[ ]` to `[x]`.
3. When the phase's acceptance criteria are all met, mark the phase `Status: complete` and move on.
4. If a task is too big, split it and add the sub-tasks inline.
5. If a decision is needed (e.g. "which icon library"), don't block on me — pick a sensible default and note it in `findings.md`.
