# PRD: op-wechat MVP

**Status:** Draft
**Date:** 2026-06-26
**Owner:** bilbilmyc
**Repo:** `git@github.com:bilbilmyc/op-wechat.git`

---

## 1. Background

`op-wechat` is a self-hostable operations backend for WeChat Official Accounts (公众号). The name's "op" stands for **Open Platform** — the long-term direction is to bridge multiple WeChat apps via unionid and to expose third-party developer APIs. v1 ships the operations surface for the 公众号 channel; the open-platform surface is deferred to v2 (foundation laid via `unionid` collection and multi-row `wechat_apps`).

The product replaces routine workflows that today require logging into 微信公众平台, and adds capabilities the official console does not provide: auto-reply rules, scheduled broadcasts, multi-app switching in one place, and an open-platform-ready data model.

## 2. Goals

A single operator can run 2+ public accounts from one installation, handling:

- All inbound fan messages in a unified inbox
- Customer-service replies with image / text / history
- Targeted mass broadcasts (immediate or scheduled)
- Automated responses to subscribe, keyword, and menu-click events

without ever needing to log into 微信公众平台 for routine operations.

## 3. Non-goals (v1)

- Multi-tenant SaaS / billing
- Cross-app fan linking (fans are siloed per app; unionid is collected but not yet used to merge)
- Workflow / DAG automation (rules are match-and-respond only)
- Rich content (cards, mini-program links, voice replies)
- 视频号 / 企业微信 / 微信支付
- Mobile client, analytics dashboards, ticketing, @-mentions, collaborative editing
- Per-app RBAC (any admin sees all apps in v1)

## 4. Personas

| Persona | Description | Primary need in v1 |
|---|---|---|
| **公众号 operator (primary)** | The person logging into this product to manage one or more public accounts they own or operate | A single place to see all messages, reply, broadcast, and configure rules across their apps |
| **公众号 follower (secondary)** | The end user on WeChat who follows a 公众号 | Faster, more relevant replies; consistent experience across touchpoints (out of product scope, but the operator's goal) |

v1 is single-tenant; SaaS for "other operators" is v2 once multi-tenancy is built.

## 5. User Stories

### 5.1 Multi-app

- As an operator running 2+ accounts, I can add each account's app_id / app_secret in settings and switch between them with a single click in the top nav.
- As an operator, I can see at a glance which apps are healthy (token refreshed, last webhook received) and which need attention.

### 5.2 Customer-service reply

- As an operator, I see a per-app inbox of all recent fan messages, sorted by time.
- I can open a conversation, read the full history, and reply with text or an image.
- I can mark messages as read and see an unread count.
- All replies are recorded with the operator's identity and visible to other operators reviewing history.

### 5.3 Mass broadcast

- As an operator, I can compose a broadcast (text, image, or link) targeted at all fans, a tag, or a hand-picked list.
- I can send it immediately or schedule it for a specific time.
- I can see the progress (sent / failed per fan) in real time and manually retry failures.

### 5.4 Auto-reply

- As an operator, I can configure a rule that fires when a new fan subscribes (welcome message).
- I can configure keyword rules (exact match, fuzzy match) that reply with text / image / article cards.
- I can configure menu-click rules that respond to specific menu events.
- I can see an execution log of which rules fired, when, for which fan, and whether the action succeeded.

### 5.5 Fan management

- As an operator, I can list fans for the active app, search by nickname / openid / tag, and view a fan's full message history.
- I can edit a fan's remark and manage tags (synced to WeChat).
- I can create, rename, and delete tags.

## 6. Functional Requirements

### 6.1 Cross-cutting: Multi-app

- App switcher is always visible in the top nav; the active app drives all data queries.
- All API endpoints scope reads and writes to the active `wechat_app_id`.
- Webhook URL is per-app: `/webhook/{app_id}`; signature verification uses that app's `token`; AES decryption uses that app's `encoding_aes_key`.
- `access_token` is cached per app (in-memory LRU + DB-backed for cross-process sharing and cold restart).
- App settings page supports: add, edit (name, app_id, app_secret, token, encoding_aes_key, type, avatar, QR), disable, delete.

### 6.2 Fan management

- List: paginated, search by nickname / openid / unionid / tag, filter by tag / subscription status.
- Detail: profile, tag list, remark, full message history, full conversation history.
- Actions: edit remark, manage tags (create / rename / delete tag, assign / unassign fan ↔ tag).
- Tag CRUD syncs to WeChat's `/cgi-bin/tags/*` APIs; failures surface in the UI without rolling back the local state.

### 6.3 Customer-service reply

- Inbox: per-app list of conversations sorted by `last_message_at DESC`, with `unread_count` and `last_message_preview`.
- Conversation view: chronological message list with direction, type, content, agent attribution.
- Reply: text or image (image upload goes through WeChat's `/cgi-bin/media/upload` first, then send via 客服消息 API).
- Status lifecycle: `received` → `sending` → `sent` / `failed`; failures show error message in UI.
- Read state: opening a conversation marks all messages as read.

### 6.4 Mass broadcast

- Compose: choose `content_type` (text / image / link), fill content, choose `target_type` (all / tag / fan_ids).
- Send-now: enqueue to scheduler; progress visible in real time.
- Schedule: pick `scheduled_at`; scheduler picks up at that time.
- History: list past broadcasts with counts (total / success / failed), filterable by status and date range.
- Retry: per-fan manual retry from the broadcast detail page.
- Rate limit: default 50 fan / minute per app, configurable in app settings. WeChat's hard limit is 500K fan / day.

### 6.5 Auto-reply rules

- Trigger types: `subscribe`, `unsubscribe`, `keyword`, `menu_click`, `always` (catch-all).
- Action types: `reply_text`, `reply_image`, `reply_news`, `call_api` (HTTP webhook to a user-configured URL).
- Keyword matching: `exact`, `fuzzy` (token contains), `regex`.
- Rule fields: `name`, `priority`, `enabled`, `trigger_type`, `trigger_config`, `action_type`, `action_config`, `stop_propagation` (schema reserved in v1; UI for setting it is v2).
- Rule firing: per inbound message, evaluate enabled rules for that app in `priority DESC` order; first hit runs the action; if `stop_propagation=true` the chain stops; otherwise continue. Cap at 3 rule fires per message to prevent runaway.
- Execution log: every fire is recorded with `rule_id`, `fan_id`, `triggered_at`, `message_id`, `action_taken`, `success`, `error_msg`. Visible in the rule detail page.

## 7. Non-functional Requirements

- **Webhook SLA**: 5-second response to WeChat. Webhook returns 200 within 200ms target; heavy work is queued via pg-boss.
- **Availability**: self-hosted single node; no SLA commitment in v1.
- **Security**: `app_secret` and `encoding_aes_key` encrypted at rest using an env-supplied master key. Admin passwords hashed with bcrypt. HTTPS at the reverse proxy.
- **Observability**: structured logs (pino) with request IDs across all 3 backend processes. No external APM in v1.
- **Portability**: runs in Docker Compose on any host with Docker. Database is plain Postgres 16.

## 8. Success Metrics (v1 launch)

Each module has one acceptance criterion (these are the "done" tests):

| Module | Acceptance |
|---|---|
| App management | Add 2 apps, switch between them, see different fan lists for each |
| Fan management | See fan list, filter by tag, edit remark; tag CRUD syncs to WeChat |
| Customer-service reply | Send a test message from a test 公众号; see it in the inbox; reply from the UI; verify the reply is received on WeChat |
| Mass broadcast | Compose a text broadcast, send to 1 fan, see `sent_at` and `success_count=1` |
| Auto-reply | Configure a keyword rule, send the keyword from WeChat, verify auto-reply arrives and execution log records the hit |

## 9. Open Risks

| Risk | Mitigation |
|---|---|
| WeChat 5-second webhook timeout | Webhook returns 200 immediately; heavy work is queued |
| access_token expiry per app | Scheduler refreshes proactively; failures trigger admin banner tagged with the failing app |
| Broadcast hitting WeChat rate limits | Built-in rate limiter; per-fan status tracking |
| Rule engine runaway | Per-message execution cap (3); enabled flag |
| 微信测试号 limitations (no template messages, restricted menu) | v1 feature set avoids test-account-blocked features; documented in dev setup |
| Schema migration with data | Prisma migrate; rollback via `migrate resolve` + manual SQL |

## 10. Out-of-scope (v2+)

- Cross-app fan linking (unified fan view, unionid-based merge, cross-app search)
- Multi-tenant SaaS: tenant table, isolation middleware, billing
- Workflow engine: rule chaining, branching, delayed actions
- Rich content: cards, mini-program links, location, voice replies
- 视频号 / 企业微信 / 支付 integrations
- Mobile client (PWA or native)
- Analytics: message volume, response time, fan growth charts
- Ticketing / SLA tracking
- Customer-service @-mentions, multi-operator concurrent editing
- Open platform surface: multi-app UI extensions, third-party developer API keys, 开放平台代开发模式支持
- Per-app RBAC

## 11. Related Documents

- Design spec: `docs/superpowers/specs/2026-06-26-op-wechat-mvp-design.md` (architecture, data model, flows, key tech choices)
- Issue tracker convention: `docs/agents/issue-tracker.md` (`.scratch/<feature>/issues/<NN>-<slug>.md`)
- Triage labels: `docs/agents/triage-labels.md`

---

> This PRD is the product surface. The design spec is the engineering surface. Implementation planning (milestones, tasks, file structure) is generated from the design spec by `writing-plans`.
