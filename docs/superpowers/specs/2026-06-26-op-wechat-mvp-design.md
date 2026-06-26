# op-wechat MVP — Design Spec

**Date:** 2026-06-26
**Status:** Draft (pending user review)
**Repo:** `git@github.com:bilbilmyc/op-wechat.git`

## 1. Background and Goals

`op-wechat` is a self-hostable operations backend for WeChat Official Accounts (公众号), with a long-term direction toward the WeChat Open Platform (开放平台) — multi-app identity bridging, unionid-driven fan linking, and third-party developer tooling. The "op" in the name stands for **open platform**.

v1 ships the 公众号 operations surface (fan management, customer-service reply, mass broadcast, auto-reply rules) for a single public account. v1 also lays the foundation for the open-platform direction by **collecting and storing `unionid`** on every fan and by structuring `wechat_apps` as a multi-row table — even though the v1 UI assumes a single app. This means v2 can add multi-app / unionid bridging / cross-app fan linking without a schema migration.

The product exists to remove the need to log into 微信公众平台 for routine operations and to expose capabilities the official console does not provide (rules, scheduling, multi-admin reply, and eventually cross-app identity).

### Resolved decisions

- **"op" meaning** — "open platform" (confirmed 2026-06-26).
- **Multi-公众号 in v1** — **v1 ships multi-app from day 1**. The admin manages 2+ public accounts side-by-side, each with its own fans, messages, rules, broadcasts, and menu. The UI has an app switcher; the backend routes per-app; tokens and rate limits are scoped per app. Cross-app fan linking (unified fan view, search across apps, unionid-based merge) remains v2 — see §11.

## 2. v1 Scope

### In scope (must ship)

**Multi-app** is a cross-cutting v1 requirement. Every module below must work for 2+ public accounts managed in the same installation.

| Module | Acceptance criteria |
|---|---|
| App management | App switcher in top nav, settings page to add / edit / disable / delete `wechat_apps` rows, per-app QR display, per-app health indicator (token status) |
| Fan management | Per-app list (paged, search, tag filter), per-app detail view, per-app remark edit, per-app tag CRUD synced to WeChat |
| Customer-service reply | Per-app inbox list, per-app conversation view, text / image reply, unread count, reply history |
| Mass broadcast | Per-app compose (text / image / link), per-app send now, per-app schedule send, per-app send history, per-app manual retry of failed |
| Auto-reply rules | Per-app subscribe reply, per-app keyword reply (exact + fuzzy), per-app menu-click reply, per-app rule CRUD, per-app execution log |

### Out of scope (v1 explicitly excludes)

- **Cross-app fan linking** — fans are siloed per app. Unionid is stored but not yet used to merge / link fans across apps. v2.
- Multi-tenant / SaaS billing
- Workflow engine (DAG-style automation). v1 rules are match-and-respond, not composed flows.
- Rich-text editor (markdown + image links only)
- Channels (视频号), WeCom (企业微信), WeChat Pay
- Mobile client
- Analytics dashboards
- Ticketing system
- Customer-service @-mentions and collaborative editing
- Per-app admin RBAC (any admin can see all apps in v1; assignment comes with multi-tenant in v2)

## 3. Architecture

### Topology

Three independent Node/TypeScript processes + one PostgreSQL + one static frontend.

```
┌─────────────────────────────────────────────────────────┐
│                PostgreSQL（共享数据）                       │
│  公众号配置 / 粉丝 / 消息 / 客服会话 / 群发 / 规则            │
└─────────────────────────────────────────────────────────┘
        ▲                                       ▲
        │                                       │
┌───────┴────────┐                     ┌────────┴────────┐
│  Backend API   │ ◄─── SSE ──────────► │  Frontend SPA   │
│  Node + TS     │                     │  Vite + React    │
│  Fastify       │                     │  TypeScript      │
│  (3 个进程:     │                     │                  │
│   - api        │                     │                  │
│   - scheduler  │                     │                  │
│   - webhook)   │                     │                  │
└───────┬────────┘                     └──────────────────┘
        │
        ▼
   WeChat 公众号平台（双向）
   - 入站：webhook 接收消息 / 事件
   - 出站：客服消息 / 群发 / 模板消息
```

### Process responsibilities

- **`api`** — handles admin requests, scoped by selected `wechat_app_id`. Calls WeChat outbound APIs using the per-app cached token. Returns data filtered to the current app.
- **`webhook`** — receives WeChat pushes on a single per-app URL (`/webhook/{app_id}` or routed by query param), verifies signature, parses XML, decrypts, persists to the app's data, returns 200 within 5 seconds. Heavy work (rule firing, SSE fan-out) is enqueued and runs out-of-band.
- **`scheduler`** — periodic jobs per `wechat_apps` row: access_token refresh, scheduled broadcasts, pending-write retries. Uses `pg-boss` for queue + cron in the same Postgres.

### Multi-app model (v1)

v1 supports 2+ public accounts in one installation:

- The SPA shows an **app switcher** in the top nav. All in-app views (fans, messages, rules, broadcasts) are filtered by the selected app.
- The API carries the active `wechat_app_id` (header / cookie / path) and the backend filters every query.
- `wechat_apps` rows hold credentials (`app_secret`, `token`, `encoding_aes_key`) and per-app settings (broadcast rate limit, default menu).
- `access_token` is cached **per app** (in-memory in `api` process, persisted in DB for cross-process sharing and cold restart).
- Auto-reply rules, broadcasts, fans, messages are all scoped by `wechat_app_id`. There is no cross-app fan view in v1 — that is part of the open-platform surface deferred to v2.
- Any admin can see any app. Per-app RBAC is v2.

### Real-time updates

SSE streams from `api` to the SPA for: new inbound message, message status change, broadcast progress, rule execution. Polling fallback if SSE drops.

## 4. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| API framework | Fastify | TS-native, built-in schema validation, performance |
| ORM | Prisma | DX, migrations, type generation |
| WeChat SDK | Hand-rolled axios wrapper + custom signature/encryption | Official API is stable; no black box; `wechaty` is too heavy and RPA-flavored |
| Real-time | SSE | Unidirectional, simple, no WebSocket complexity |
| Auth | Cookie + Session (fastify-session) | Single role, no JWT needed |
| Queue / scheduler | pg-boss | Reuses existing Postgres; no Redis dependency |
| Frontend build | Vite | Fast, ESM-native |
| Frontend state | TanStack Query + Zustand | Server state vs UI state separation |
| Frontend UI | shadcn/ui + Tailwind + Radix | Modern, copy-in components, no runtime lock-in |
| Frontend forms | react-hook-form + zod | Performance, can be wired to Prisma types |
| Frontend routing | React Router v6 | Standard |
| Tests | Vitest + Supertest + Playwright | Unit / API integration / E2E |
| Deploy | Docker Compose (3 backend services + pg) + nginx static for SPA | Self-host friendly, clear units |

## 5. Data Model

11 tables. PostgreSQL via Prisma. UUID primary keys. All timestamps `timestamptz`.

### A. Configuration / Identity

- **`admins`** — `id, email (unique), password_hash, name, role, created_at, updated_at`
- **`wechat_apps`** — `id, name, app_id, app_secret (encrypted), token, encoding_aes_key, type (subscription|service), avatar_url, qr_url, created_at, updated_at`

### B. Fans

- **`fans`** — `id, wechat_app_id, openid, unionid, nickname, avatar_url, subscribe_status, subscribed_at, unsubscribed_at, remark, last_active_at, created_at, updated_at`
- **`fan_tags`** — `id, wechat_app_id, wechat_tag_id, name, created_at`
- **`fan_tag_assignments`** — `fan_id, tag_id, assigned_at`, PK `(fan_id, tag_id)`

### C. Messages and conversations

- **`messages`** — `id, wechat_app_id, fan_id, direction (inbound|outbound), msg_type (text|image|voice|video|event|link|location), content, media_id, wechat_msg_id, status (received|sending|sent|failed), agent_id, created_at, updated_at`
- **`conversations`** — `id, wechat_app_id, fan_id, last_message_at, last_message_preview, unread_count, assigned_agent_id, status (open|closed)`. UNIQUE `(wechat_app_id, fan_id)`.

### D. Broadcasts

- **`broadcasts`** — `id, wechat_app_id, created_by, content_type, content_json, target_type (all|tag|fan_ids), target_filter_json, status (draft|scheduled|sending|sent|failed), scheduled_at, sent_at, total_count, success_count, failed_count, created_at, updated_at`
- **`broadcast_targets`** — `id, broadcast_id, fan_id, status (pending|sent|failed), sent_at, error_msg`. Used for retry and reporting.

### E. Auto-reply rules

- **`rules`** — `id, wechat_app_id, name, trigger_type (subscribe|unsubscribe|keyword|menu_click|always), trigger_config_json, action_type (reply_text|reply_image|reply_news|call_api), action_config_json, priority, stop_propagation, enabled, created_at, updated_at`. The `stop_propagation` column is reserved at the schema level in v1; the UI to set it is v2. The engine honours it whenever the value is `true`.
- **`rule_executions`** — `id, rule_id, fan_id, triggered_at, message_id, action_taken, success, error_msg`

### Indexes

- `fans(wechat_app_id, openid)` UNIQUE
- `fans(wechat_app_id, unionid)` (partial, where not null)
- `messages(wechat_app_id, fan_id, created_at DESC)`
- `messages(wechat_app_id, created_at DESC)`
- `conversations(wechat_app_id, last_message_at DESC)`
- `rule_executions(rule_id, triggered_at DESC)`
- `broadcast_targets(broadcast_id, status)`

### Design notes

1. `messages` is append-only. `conversations` is a denormalized aggregate updated on every new message (upsert).
2. `broadcast_targets` is its own table (not a JSON array) to support per-fan retry, rate limiting (50 fan/min default), and reporting.
3. Rule `trigger_config` and `action_config` are JSON for v1 flexibility. Promote to typed columns only if querying by them becomes a hot path.
4. `agent_id` on `messages` is a FK to `admins.id` (every admin is also a customer-service agent in v1; the `role` column distinguishes them later if needed). NULL for system / rule-fired replies.

## 6. Key Flows

### Flow 1: Inbound message (公众号 → backend) — 5-second SLA

```
WeChat POST /webhook/{app_id}
  1. Resolve wechat_apps row by app_id (~5ms)
  2. Verify signature using that app's token (~2ms)
  3. Parse XML (~1-5ms)
  4. If encrypted, AES decrypt with that app's encoding_aes_key (~1-3ms)
  5. Persist scoped to that app (insert message + upsert conversation + update fan last_active_at)
     Target total < 200ms
  6. 200 OK
  7. Enqueue: rule.evaluate(message_id) → out-of-band
  8. Enqueue: sse.fanout(message_id) → out-of-band
```

Steps 6-7 run via pg-boss. If they fail, the message is still in `messages`; the admin can see it. Failures do not cause WeChat retries (the 200 has already been sent).

### Flow 2: Customer-service reply

```
Admin submits reply
  → POST /api/messages {fan_id, content, msg_type}
  → Insert message (direction=outbound, status=sending)
  → Call WeChat 客服消息 API (async, up to 30s)
  → Success: status=sent, store wechat_msg_id
  → Failure: status=failed, store error_msg, single retry if 4xx-token-expired
  → SSE pushes update to the client
```

### Flow 3: Broadcast

```
Admin creates draft
  → POST /api/broadcasts (status=draft)
Admin clicks "send now" or "schedule"
  → now: enqueue broadcast.send
  → schedule: pg-boss schedules at scheduled_at
Worker picks up
  → Stream through fans per rate limit (default 50 fan/min, per-app configurable in v1 settings; WeChat's hard limit is 500K fans/day)
  → Per fan: insert broadcast_targets row, status=pending
  → Call WeChat mass-send API
  → Update broadcast_targets.status
  → On completion: update broadcasts.status, counts, SSE notify
```

### Flow 4: Auto-reply rule firing

```
rule.evaluate(message_id) job:
  1. Load enabled rules for app, sorted by priority DESC
  2. For each rule, evaluate trigger against the message:
     - subscribe: was this a subscribe event?
     - keyword: tokenized match (exact / fuzzy / regex)
     - menu_click: event key match
     - always: catch-all
  3. Hit: execute action
     - reply_text/image/news: insert outbound message + call WeChat API
     - call_api: call user-configured webhook
  4. Write rule_executions row
  5. If stop_propagation=true, break
```

### Flow 5: access_token refresh

```
Every 100 minutes, per wechat_apps row:
  1. For each app, check the cached token expiry (in-memory LRU + DB-backed)
  2. If within 10 min of expiry (or no cache): call /cgi-bin/token with that app's app_id / app_secret
  3. Persist to in-memory cache + DB row
  4. On failure: retry at 5/15/60 min, max 3, then alert via SSE banner tagged with the failing app_id
```

## 7. Error Handling

### Classification

- **Business errors** (bad input, illegal state) → 4xx, no retry
- **WeChat 4xx** (token expired, message format error) → no auto-retry; refresh token and single retry if appropriate
- **WeChat 5xx / network** → exponential backoff (1s, 5s, 30s), max 3 attempts
- **Webhook inbound failure** → no app-side retry (WeChat retries 3 times itself); failures logged
- **DB write failure on critical path** → row in `pending_writes`, retry worker drains

### Response shape

All API errors return `{ code: string, message: string, details?: any }`. Fastify `setErrorHandler` enforces.

### Observability

- Structured logs (pino)
- Request IDs propagate across api / webhook / scheduler
- v1: no external APM. Logs are the source of truth. v2: OpenTelemetry.

## 8. Testing

| Layer | Tool | Coverage target |
|---|---|---|
| Unit (rule engine, dispatcher, token cache, rate limiter) | Vitest | ≥ 80% line coverage on these modules |
| API integration (real Postgres via testcontainers) | Vitest + Supertest | All endpoints happy + sad path |
| WeChat API | Hand-rolled mock server | All outbound calls; all inbound shapes |
| E2E (Playwright) | Playwright | Critical paths: subscribe → reply → broadcast → rule fires |

The WeChat mock server is a separate process (Fastify) returning canned responses. Tests can override response per-call to simulate failures, rate limits, etc.

## 9. Deployment

`docker-compose.yml` with services:

- `postgres` (postgres:16-alpine)
- `api` (Node image, runs `node dist/api.js`)
- `webhook` (Node image, runs `node dist/webhook.js`)
- `scheduler` (Node image, runs `node dist/scheduler.js`)
- `nginx` (nginx:alpine, serves built SPA, reverse-proxies `/api` and `/webhook` to the right services)

`nginx` is the only publicly exposed port. TLS termination at the proxy.

Secrets via `.env` (gitignored). `app_secret` and `encoding_aes_key` are also encrypted at rest in `wechat_apps` using an env-supplied master key.

## 10. Milestones (informational — final plan comes from `writing-plans`)

M1. Skeleton: repo structure, docker-compose up, blank SPA served, /healthz on each backend service. Per-app URL routing placeholders in place.
M2. Schema + auth + app management: Prisma migrations applied, admin can log in, app switcher renders, settings page can add / edit / disable `wechat_apps` rows. Per-app token cache plumbing in place.
M3. Inbound pipeline: webhook routes by `app_id`, verifies, persists, messages appear in the right app's inbox (read-only).
M4. Outbound reply: admin can send text / image reply through the active app's token; message status updates via SSE.
M5. Fan management: per-app list / detail / tag / remark; tag CRUD syncs to WeChat.
M6. Auto-reply rules: per-app rule CRUD, execution log, manual test.
M7. Broadcast: per-app compose, send now, schedule, history, retry.
M8. Polish: error pages, empty states, settings page, basic docs.

## 11. Out-of-scope deferral list (v2+)

**Cross-app fan linking (unionid-based)** is now also explicitly v2: in v1, fans are siloed per app even though `unionid` is collected. The unified / merged fan view, cross-app search, and the API surface for third-party developers to query a fan by unionid across apps are all v2 work.

- Multi-tenant: tenant table, isolation middleware, per-tenant rate limits, billing
- Workflow engine: rule chaining, branching, delayed actions
- Rich content: cards, mini-program links, location, voice replies
- 视频号 / 企业微信 / 支付 integrations
- Mobile client (PWA or native)
- Analytics: message volume, response time, fan growth charts
- Ticketing / SLA tracking
- Customer-service @-mentions, multi-operator concurrent editing
- **Open platform surface (the "op" roadmap)**: multi-app UI / switching, unionid-driven cross-app fan linking, mini-program / web-app / mobile-app identity bridge, third-party developer API keys and webhook routing, 开放平台代开发模式支持

## 12. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| WeChat 5-second webhook timeout | Webhook returns 200 immediately; heavy work is queued |
| access_token expiry storm | Scheduler refreshes proactively; refresh failures trigger admin banner |
| Broadcast hitting WeChat rate limits (50/min default) | Built-in rate limiter; broadcast_targets records per-fan status |
| Rule engine runaway (loops or expensive rules) | Per-message execution cap (e.g. max 3 rules fired per message); enabled flag |
| DB schema migration with production data | Prisma migrate; documented rollback via `migrate resolve` + manual SQL |
| 微信测试号 limitations (no template messages, restricted menu) | v1 feature set avoids test-account-blocked features; documented in dev setup |
| Single-tenant assumption later blocks multi-tenant migration | `wechat_app_id` foreign keys on all tenant-scoped tables from day 1 |
