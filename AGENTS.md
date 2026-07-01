# AGENTS.md

## Quick reference

```bash
pnpm run typecheck              # full typecheck: libs (tsc --build) then artifacts + scripts
pnpm run build                  # typecheck + build all (esbuild for api-server, vite for apps)
pnpm --filter @workspace/api-server run dev   # API server (requires PORT env)
pnpm --filter @workspace/app run dev          # Vite dev server (port 5173, proxies /api → :5000)
pnpm --filter @workspace/api-spec run codegen # regenerate API client + zod schemas from openapi.yaml
pnpm --filter @workspace/db run push          # drizzle-kit push (dev schema migrations)
```

## Must-use pnpm

The `preinstall` script in root `package.json` blocks npm/yarn. Use `pnpm` for everything.

## Generated code — never hand-edit

- `lib/api-client-react/src/generated/` — React Query hooks (Orval)
- `lib/api-zod/src/generated/` — Zod schemas and types (Orval)
- Source of truth: `lib/api-spec/openapi.yaml`

**Workflow**: edit `openapi.yaml` → run `pnpm --filter @workspace/api-spec run codegen` → run `pnpm run typecheck`.

Orval forces the OpenAPI `info.title` to `"Api"` (see `orval.config.ts` line 9-10), producing files named `api.ts`, `api.schemas.ts`, etc.

## Architecture

```
artifacts/app/          React frontend — Vite, Tailwind v4, React Query, wouter
artifacts/api-server/   Express 5 API — built with esbuild, runs on PORT
artifacts/mockup-sandbox/  UI component sandbox (radix-ui)
lib/db/                 Drizzle ORM — dual-mode: PGlite (local) or PostgreSQL
lib/services/           Deepgram transcription + OpenAI gem analysis
lib/api-spec/           OpenAPI 3.1 spec + Orval codegen config
lib/api-zod/            Generated Zod schemas (from OpenAPI)
lib/api-client-react/   Generated React Query hooks (from OpenAPI)
scripts/                CLI tools (transcribe.ts, hello.ts)
```

API routes: `GET /api/healthz`, `/api/recordings/*` (upload, list, get, delete, transcribe, analyze, gems), `GET /api/gems`.

Frontend `@/` alias maps to `artifacts/app/src/`.

## DB: two modes

- **PGlite** (default, no external DB): if `DATABASE_URL` is not set, uses `@electric-sql/pglite` (data at `.local/pglite/`). Schema is auto-created on first query.
- **PostgreSQL**: set `DATABASE_URL` to use a real Postgres. Calls `drizzle-orm/node-postgres`.

## Environment variables

| Variable | Required by |
|---|---|
| `PORT` | api-server (required — crashes without it) |
| `DEEPGRAM_API_KEY` | TranscriptionService — needed for `/recordings/:id/transcribe` |
| `OPENAI_API_KEY` | GemAnalysisService — needed for `/recordings/:id/analyze` (optional; transcription works without it) |
| `DATABASE_URL` | Optional — if set, uses PostgreSQL instead of PGlite |

## Notable conventions

- **`zod/v4`**: This project imports from `"zod/v4"`, not `"zod"`. Do not change.
- **`catalog:`**: Dependencies specified as `"catalog:"` in `package.json` are resolved from the `catalog` block in `pnpm-workspace.yaml`. Keep versions centralized there.
- **`minimumReleaseAge: 1440`**: pnpm blocks packages published less than 1 day ago (supply-chain defense). Exclude trusted packages via `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` — never disable entirely.
- **`customConditions: ["workspace"]`**: tsconfig base sets this — import conditions use the `"workspace"` key, matching `workspace:*` protocol references.
- API server `build.mjs` bundles to ESM (`.mjs`) via esbuild with a `require` polyfill for CJS plugins. The `external` list in `build.mjs` is intentionally large to cover future native-module dependencies.
- **No formatter configured**: Prettier is a devDep but no `.prettierrc` or format scripts exist. Only Orval's codegen applies prettier internally.
- **No test framework**: No jest/vitest scripts or config.

## File layout notes

- `input/` — uploaded audio files (multer destination)
- `output/` — present but unused in code
- `.local/` — PGlite data + other local state (gitignored)
- `scripts/post-merge.sh` — runs `pnpm install --frozen-lockfile` then `pnpm --filter db push` on merge

## TS project references

The root `tsconfig.json` references only the lib packages (db, api-client-react, api-zod, api-services). The `typecheck:libs` script runs `tsc --build` which builds referenced projects in dependency order. Artifacts and scripts have their own `tsconfig.json` and run `tsc -p tsconfig.json --noEmit` independently.
