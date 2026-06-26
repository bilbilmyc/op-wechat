# op-wechat

Self-hostable operations backend for WeChat Official Accounts (公众号), with a long-term direction toward the WeChat Open Platform.

> v1 status: **planning complete, Phase 1 (skeleton) in progress**.

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up
```

Then:

- http://localhost → SPA (Phase 2+ will have real UI)
- http://localhost/api/healthz → API health
- http://localhost/webhook/healthz → Webhook health
- http://localhost:3003/healthz → Scheduler health (direct)
- http://localhost:5173 → Vite dev server (direct, for HMR)

## Quick start (local dev)

```bash
cp .env.example .env
npm install
docker compose up postgres   # start Postgres only
npm run dev:api              # in one terminal
npm run dev:webhook          # in another terminal
npm run dev:scheduler        # in another terminal
npm run dev:web              # in another terminal
```

## Layout

```
apps/
  api/             ← Fastify API server (port 3001)
  webhook/         ← Fastify inbound receiver (port 3002)
  scheduler/       ← pg-boss workers (HTTP liveness on 3003)
  web/             ← Vite + React SPA
packages/
  shared/          ← Shared types, zod schemas, WeChat crypto
docs/
  agents/          ← Engineering-skills config (issue-tracker, triage, domain)
  superpowers/
    specs/         ← Design spec for the MVP
.scratch/
  op-wechat-mvp/   ← Product PRD
task_plan.md       ← Implementation plan (8 phases, ~50 tasks)
findings.md        ← Decisions and key findings
progress.md        ← Session log
```

## Documentation

- **Design spec:** `docs/superpowers/specs/2026-06-26-op-wechat-mvp-design.md`
- **Product PRD:** `.scratch/op-wechat-mvp/PRD.md`
- **Implementation plan:** `task_plan.md`
- **Engineering skills config:** `AGENTS.md` + `docs/agents/`

## License

TBD.
