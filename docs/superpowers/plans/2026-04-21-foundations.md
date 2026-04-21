# Foundations — Template Library + Template Engine + Local Ledger

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a CLI that can invoke any of 13 parameterized Numscript templates against a real local Formance ledger, with every template CI-validated against the Numscript Playground API.

**Architecture:** TypeScript monorepo (pnpm workspaces). Templates live as `.num` + `schema.json` pairs in `/templates`. A `template-engine` package loads, validates params, renders Numscript, dry-runs and commits via Formance SDK. A small CLI package wraps the engine for manual invocation. CI runs every template's `example.json` against the Playground API on each commit.

**Tech Stack:** Node 22, TypeScript 5.6+, pnpm, Docker Compose (Formance + Postgres), Anthropic SDK (later plans), Formance TS SDK, Ajv (JSON Schema), Vitest, GitHub Actions.

**Scope boundary:** No agents, no orchestrator, no front-end. This plan stops at "I can run `pnpm run-template gig_settlement --example` and see postings in the ledger."

---

## File structure (created by end of plan)

```
numscript-agent-city/
├── package.json                        # root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── docker-compose.yml                  # Formance + Postgres
├── README.md
├── .github/workflows/
│   └── validate-templates.yml
├── scripts/
│   ├── bootstrap.sh                    # one-shot local setup
│   ├── seed-genesis.ts                 # initial agent funding
│   └── validate-templates.ts           # CI runner
├── templates/
│   ├── p2p_transfer/
│   │   ├── template.num
│   │   ├── schema.json
│   │   ├── example.json
│   │   └── README.md
│   ├── gig_settlement/{...same 4 files}
│   ├── escrow_hold/{...}
│   ├── escrow_release/{...}
│   ├── escrow_refund/{...}
│   ├── api_call_fee/{...}
│   ├── subscription_charge/{...}
│   ├── revenue_split/{...}
│   ├── dispute_arbitration/{...}
│   ├── refund/{...}
│   ├── waterfall_pay/{...}
│   ├── credit_line_charge/{...}
│   └── liquidate_wallet/{...}
└── packages/
    ├── template-engine/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── src/
    │   │   ├── index.ts                # public exports
    │   │   ├── types.ts                # Template, Params, InvokeResult
    │   │   ├── loader.ts               # discover + load templates from disk
    │   │   ├── validator.ts            # param validation via Ajv
    │   │   ├── renderer.ts             # inject vars into Numscript
    │   │   ├── ledger-client.ts        # Formance SDK wrapper
    │   │   └── invoke.ts               # orchestration: load → validate → render → dry-run → commit
    │   └── test/
    │       ├── loader.test.ts
    │       ├── validator.test.ts
    │       ├── renderer.test.ts
    │       ├── ledger-client.test.ts   # hits real local ledger
    │       └── invoke.test.ts
    └── cli/
        ├── package.json
        ├── tsconfig.json
        └── src/
            └── run-template.ts         # pnpm run-template <id> [--example | --param k=v ...]
```

**Responsibility split:**
- `loader.ts` — filesystem I/O only (find + read template files)
- `validator.ts` — pure function (params + schema → ok/err)
- `renderer.ts` — pure function (template source + vars → Numscript string)
- `ledger-client.ts` — network I/O only (Formance SDK calls)
- `invoke.ts` — composes the above; the only module that knows the full pipeline

Each file is independently testable. `invoke.ts` is the only integration-level module.

---

## Task 1: Repo scaffolding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `README.md`

- [ ] **Step 1: `git init` and base files**

```bash
cd /Users/finnmabie/Documents/numscript-agent-city
git init
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "numscript-agent-city",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "run-template": "pnpm --filter @nac/cli run-template",
    "seed-genesis": "tsx scripts/seed-genesis.ts",
    "validate-templates": "tsx scripts/validate-templates.ts",
    "ledger:up": "docker compose up -d && ./scripts/wait-for-ledger.sh",
    "ledger:down": "docker compose down -v"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.2"
  }
}
```

- [ ] **Step 3: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 4: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "dist"
  },
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
/data/
```

- [ ] **Step 6: Write minimal `README.md`**

```markdown
# Numscript Agent City

An agent economy demo on Formance Ledger. See `docs/superpowers/specs/` for design.

## Quick start

    pnpm install
    pnpm ledger:up
    pnpm seed-genesis
    pnpm run-template p2p_transfer --example
```

- [ ] **Step 7: Install and commit**

```bash
pnpm install
git add .
git commit -m "chore: repo scaffolding"
```

Expected: `pnpm install` succeeds, empty workspace installed.

---

## Task 2: Docker Compose for Formance + Postgres

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `scripts/wait-for-ledger.sh`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: formance
      POSTGRES_PASSWORD: formance
      POSTGRES_DB: ledger
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    ports:
      - "5433:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U formance"]
      interval: 2s
      timeout: 3s
      retries: 20

  ledger:
    image: ghcr.io/formancehq/ledger:v2.3.1
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      POSTGRES_URI: postgres://formance:formance@postgres:5432/ledger?sslmode=disable
      BIND: 0.0.0.0:3068
    ports:
      - "3068:3068"
    command: ["serve"]
```

- [ ] **Step 2: Write `.env.example`**

```
LEDGER_URL=http://localhost:3068
LEDGER_NAME=city
GENESIS_POOL=USD/2 1000000
```

- [ ] **Step 3: Write `scripts/wait-for-ledger.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
URL="${LEDGER_URL:-http://localhost:3068}/_info"
echo "Waiting for ledger at $URL ..."
for i in {1..60}; do
  if curl -fsS "$URL" > /dev/null 2>&1; then
    echo "Ledger ready."
    exit 0
  fi
  sleep 1
done
echo "Ledger failed to become ready after 60s" >&2
exit 1
```

Make it executable:

```bash
chmod +x scripts/wait-for-ledger.sh
```

- [ ] **Step 4: Smoke test — bring up ledger and verify**

```bash
cp .env.example .env
pnpm ledger:up
curl -fsS http://localhost:3068/_info
```

Expected: JSON response with `"server": "ledger"` and a version string.

- [ ] **Step 5: Create ledger named `city`**

```bash
curl -fsSX POST http://localhost:3068/v2/city
```

Expected: `204 No Content` (or `400` if already exists — both fine).

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example scripts/wait-for-ledger.sh
git commit -m "chore: local Formance ledger via docker-compose"
```

---

## Task 3: Template-engine package scaffold + types

**Files:**
- Create: `packages/template-engine/package.json`, `packages/template-engine/tsconfig.json`, `packages/template-engine/src/types.ts`

- [ ] **Step 1: Write `packages/template-engine/package.json`**

```json
{
  "name": "@nac/template-engine",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `packages/template-engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/template-engine/src/types.ts`**

```ts
export type TemplateId = string;

export interface TemplateSchema {
  id: TemplateId;
  description: string;
  params: Record<string, ParamSpec>;
}

export type ParamSpec =
  | { type: "monetary"; asset?: string; max?: string; min?: string; description?: string }
  | { type: "account"; pattern?: string; const?: string; description?: string }
  | { type: "portion"; max?: string; min?: string; description?: string }
  | { type: "string"; pattern?: string; maxLength?: number; description?: string }
  | { type: "number"; minimum?: number; maximum?: number; description?: string };

export interface Template {
  id: TemplateId;
  source: string;              // raw .num file contents
  schema: TemplateSchema;      // parsed schema.json
  example: Record<string, unknown>;
  readme: string;
}

export type ParamValue =
  | { asset: string; amount: number }     // monetary
  | string                                 // account | string | portion
  | number;                                // number

export interface InvokeParams {
  templateId: TemplateId;
  params: Record<string, ParamValue>;
  reference?: string;
}

export interface InvokeResult {
  ok: boolean;
  templateId: TemplateId;
  params: Record<string, ParamValue>;
  renderedNumscript: string;
  dryRun?: LedgerPreview;
  committed?: LedgerTx;
  error?: InvokeError;
}

export interface LedgerPreview {
  postings: Array<{ source: string; destination: string; asset: string; amount: number }>;
  txMeta: Record<string, string>;
  accountMeta: Record<string, Record<string, string>>;
}

export interface LedgerTx extends LedgerPreview {
  id: string;
  timestamp: string;
}

export interface InvokeError {
  phase: "load" | "validate" | "render" | "dry-run" | "commit";
  code: string;
  message: string;
  detail?: unknown;
}
```

- [ ] **Step 4: Commit**

```bash
pnpm install
git add packages/template-engine
git commit -m "feat(template-engine): package scaffold and types"
```

Expected: `pnpm install` wires the workspace package.

---

## Task 4: Template loader (discover + read from disk)

**Files:**
- Create: `packages/template-engine/src/loader.ts`, `packages/template-engine/test/loader.test.ts`

- [ ] **Step 1: Write failing test `packages/template-engine/test/loader.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadTemplates, loadTemplate } from "../src/loader.js";

const FIX = join(__dirname, "__fixtures__/templates");

beforeAll(() => {
  rmSync(FIX, { recursive: true, force: true });
  mkdirSync(join(FIX, "demo"), { recursive: true });
  writeFileSync(join(FIX, "demo/template.num"), "send [USD/2 100] (source=@a destination=@b)");
  writeFileSync(join(FIX, "demo/schema.json"), JSON.stringify({
    id: "demo",
    description: "demo",
    params: { x: { type: "monetary", asset: "USD/2" } }
  }));
  writeFileSync(join(FIX, "demo/example.json"), JSON.stringify({ x: { asset: "USD/2", amount: 100 } }));
  writeFileSync(join(FIX, "demo/README.md"), "# demo");
});

describe("loader", () => {
  it("loads a single template by id", async () => {
    const t = await loadTemplate(FIX, "demo");
    expect(t.id).toBe("demo");
    expect(t.source).toContain("send [USD/2 100]");
    expect(t.schema.params.x.type).toBe("monetary");
    expect(t.example).toEqual({ x: { asset: "USD/2", amount: 100 } });
    expect(t.readme).toContain("demo");
  });

  it("discovers all templates in a directory", async () => {
    const all = await loadTemplates(FIX);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("demo");
  });

  it("throws when a required file is missing", async () => {
    await expect(loadTemplate(FIX, "does-not-exist")).rejects.toThrow(/not found|ENOENT/);
  });
});
```

- [ ] **Step 2: Run the test — should fail (module not found)**

```bash
cd packages/template-engine && pnpm test
```

Expected: FAIL — `Cannot find module '../src/loader.js'`.

- [ ] **Step 3: Write `packages/template-engine/src/loader.ts`**

```ts
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Template, TemplateSchema } from "./types.js";

export async function loadTemplate(rootDir: string, id: string): Promise<Template> {
  const dir = join(rootDir, id);
  const [source, schemaRaw, exampleRaw, readme] = await Promise.all([
    readFile(join(dir, "template.num"), "utf8"),
    readFile(join(dir, "schema.json"), "utf8"),
    readFile(join(dir, "example.json"), "utf8"),
    readFile(join(dir, "README.md"), "utf8")
  ]);
  const schema = JSON.parse(schemaRaw) as TemplateSchema;
  if (schema.id !== id) {
    throw new Error(`Template id mismatch: dir=${id}, schema.id=${schema.id}`);
  }
  const example = JSON.parse(exampleRaw) as Record<string, unknown>;
  return { id, source, schema, example, readme };
}

export async function loadTemplates(rootDir: string): Promise<Template[]> {
  const entries = await readdir(rootDir);
  const ids: string[] = [];
  for (const entry of entries) {
    const s = await stat(join(rootDir, entry));
    if (s.isDirectory()) ids.push(entry);
  }
  return Promise.all(ids.map((id) => loadTemplate(rootDir, id)));
}
```

- [ ] **Step 4: Run the test — should pass**

```bash
pnpm test
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/template-engine/src/loader.ts packages/template-engine/test/loader.test.ts
git commit -m "feat(template-engine): loader"
```

---

## Task 5: Param validator

**Files:**
- Create: `packages/template-engine/src/validator.ts`, `packages/template-engine/test/validator.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateParams } from "../src/validator.js";
import type { TemplateSchema } from "../src/types.js";

const schema: TemplateSchema = {
  id: "t",
  description: "test",
  params: {
    amount: { type: "monetary", asset: "USD/2", max: "1000_00" },
    from: { type: "account", pattern: "^@agents:.+$" },
    fee: { type: "portion", max: "20%" }
  }
};

describe("validator", () => {
  it("accepts valid params", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 500 },
      from: "@agents:alice",
      fee: "5%"
    });
    expect(r.ok).toBe(true);
  });

  it("rejects monetary over max", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 999999999 },
      from: "@agents:alice",
      fee: "5%"
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("BoundsError");
  });

  it("rejects monetary with wrong asset", () => {
    const r = validateParams(schema, {
      amount: { asset: "EUR/2", amount: 100 },
      from: "@agents:alice",
      fee: "5%"
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("AssetMismatch");
  });

  it("rejects account not matching pattern", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 100 },
      from: "@platform:treasury:main",
      fee: "5%"
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("PatternMismatch");
  });

  it("rejects portion over max", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 100 },
      from: "@agents:alice",
      fee: "99%"
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("BoundsError");
  });

  it("rejects missing required param", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 100 }
    } as never);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("MissingParam");
  });
});
```

- [ ] **Step 2: Run test — should fail**

Expected: FAIL — `Cannot find module '../src/validator.js'`.

- [ ] **Step 3: Write `packages/template-engine/src/validator.ts`**

```ts
import type { TemplateSchema, ParamValue, InvokeError } from "./types.js";

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: InvokeError };

// Parse "1000_00" → 100000, "20%" → 0.2, "1/3" → 0.333...
function parseMinorUnits(s: string): number {
  return Number(s.replace(/_/g, ""));
}
function parsePortion(s: string): number {
  const trimmed = s.trim();
  if (trimmed.endsWith("%")) return Number(trimmed.slice(0, -1)) / 100;
  const [n, d] = trimmed.split("/");
  if (d) return Number(n) / Number(d);
  return Number(trimmed);
}

export function validateParams(
  schema: TemplateSchema,
  params: Record<string, ParamValue>
): ValidationResult {
  for (const [name, spec] of Object.entries(schema.params)) {
    const v = params[name];
    if (v === undefined) {
      return { ok: false, error: err("MissingParam", `Missing required param: ${name}`) };
    }

    switch (spec.type) {
      case "monetary": {
        if (typeof v !== "object" || v === null || !("asset" in v) || !("amount" in v)) {
          return { ok: false, error: err("TypeMismatch", `${name} must be { asset, amount }`) };
        }
        if (spec.asset && v.asset !== spec.asset) {
          return { ok: false, error: err("AssetMismatch", `${name}: expected ${spec.asset}, got ${v.asset}`) };
        }
        if (typeof v.amount !== "number" || !Number.isInteger(v.amount) || v.amount < 0) {
          return { ok: false, error: err("TypeMismatch", `${name}.amount must be non-negative integer (minor units)`) };
        }
        if (spec.max !== undefined && v.amount > parseMinorUnits(spec.max)) {
          return { ok: false, error: err("BoundsError", `${name}.amount exceeds max ${spec.max}`) };
        }
        if (spec.min !== undefined && v.amount < parseMinorUnits(spec.min)) {
          return { ok: false, error: err("BoundsError", `${name}.amount below min ${spec.min}`) };
        }
        break;
      }
      case "account": {
        if (typeof v !== "string") {
          return { ok: false, error: err("TypeMismatch", `${name} must be string (account address)`) };
        }
        if (spec.const !== undefined && v !== spec.const) {
          return { ok: false, error: err("ConstMismatch", `${name} must equal ${spec.const}`) };
        }
        if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(v)) {
          return { ok: false, error: err("PatternMismatch", `${name} does not match pattern ${spec.pattern}`) };
        }
        break;
      }
      case "portion": {
        if (typeof v !== "string") {
          return { ok: false, error: err("TypeMismatch", `${name} must be string portion like "5%" or "1/3"`) };
        }
        const p = parsePortion(v);
        if (!Number.isFinite(p) || p < 0 || p > 1) {
          return { ok: false, error: err("TypeMismatch", `${name} must be a portion in [0, 1]`) };
        }
        if (spec.max !== undefined && p > parsePortion(spec.max)) {
          return { ok: false, error: err("BoundsError", `${name} exceeds max ${spec.max}`) };
        }
        if (spec.min !== undefined && p < parsePortion(spec.min)) {
          return { ok: false, error: err("BoundsError", `${name} below min ${spec.min}`) };
        }
        break;
      }
      case "string": {
        if (typeof v !== "string") {
          return { ok: false, error: err("TypeMismatch", `${name} must be string`) };
        }
        if (spec.maxLength !== undefined && v.length > spec.maxLength) {
          return { ok: false, error: err("BoundsError", `${name} longer than maxLength ${spec.maxLength}`) };
        }
        if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(v)) {
          return { ok: false, error: err("PatternMismatch", `${name} does not match pattern ${spec.pattern}`) };
        }
        break;
      }
      case "number": {
        if (typeof v !== "number") {
          return { ok: false, error: err("TypeMismatch", `${name} must be number`) };
        }
        if (spec.minimum !== undefined && v < spec.minimum) {
          return { ok: false, error: err("BoundsError", `${name} < minimum ${spec.minimum}`) };
        }
        if (spec.maximum !== undefined && v > spec.maximum) {
          return { ok: false, error: err("BoundsError", `${name} > maximum ${spec.maximum}`) };
        }
        break;
      }
    }
  }
  return { ok: true };
}

function err(code: string, message: string): InvokeError {
  return { phase: "validate", code, message };
}
```

- [ ] **Step 4: Run test — should pass**

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/template-engine/src/validator.ts packages/template-engine/test/validator.test.ts
git commit -m "feat(template-engine): param validator"
```

---

## Task 6: Numscript renderer

**Files:**
- Create: `packages/template-engine/src/renderer.ts`, `packages/template-engine/test/renderer.test.ts`

Numscript's interpreter accepts `vars` as a separate dict — we do NOT do string substitution. The renderer's job is only to build the `vars` payload in the shape the ledger expects. The template source is passed through verbatim.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderVars } from "../src/renderer.js";
import type { TemplateSchema } from "../src/types.js";

const schema: TemplateSchema = {
  id: "t",
  description: "t",
  params: {
    amount: { type: "monetary", asset: "USD/2" },
    from: { type: "account" },
    fee: { type: "portion" },
    note: { type: "string" },
    n: { type: "number" }
  }
};

describe("renderVars", () => {
  it("renders monetary as 'USD/2 100' wire format", () => {
    const v = renderVars(schema, {
      amount: { asset: "USD/2", amount: 100 },
      from: "@agents:alice",
      fee: "5%",
      note: "hello",
      n: 42
    });
    expect(v).toEqual({
      amount: "USD/2 100",
      from: "agents:alice",    // leading @ stripped for wire format
      fee: "5%",
      note: "hello",
      n: "42"
    });
  });
});
```

- [ ] **Step 2: Run test — should fail**

- [ ] **Step 3: Write `packages/template-engine/src/renderer.ts`**

```ts
import type { TemplateSchema, ParamValue } from "./types.js";

// Ledger wire format for `vars` in a script payload:
// - monetary: "USD/2 100"
// - account:  "agents:alice"   (no leading @)
// - portion:  "5%" or "1/3"
// - string:   as-is
// - number:   stringified
export function renderVars(
  schema: TemplateSchema,
  params: Record<string, ParamValue>
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, spec] of Object.entries(schema.params)) {
    const v = params[name];
    switch (spec.type) {
      case "monetary": {
        const m = v as { asset: string; amount: number };
        vars[name] = `${m.asset} ${m.amount}`;
        break;
      }
      case "account": {
        const s = v as string;
        vars[name] = s.startsWith("@") ? s.slice(1) : s;
        break;
      }
      case "portion":
      case "string":
        vars[name] = v as string;
        break;
      case "number":
        vars[name] = String(v);
        break;
    }
  }
  return vars;
}
```

- [ ] **Step 4: Run test — should pass**

- [ ] **Step 5: Commit**

```bash
git add packages/template-engine/src/renderer.ts packages/template-engine/test/renderer.test.ts
git commit -m "feat(template-engine): vars renderer"
```

---

## Task 7: Ledger client (dry-run + commit)

**Files:**
- Create: `packages/template-engine/src/ledger-client.ts`, `packages/template-engine/test/ledger-client.test.ts`

Uses raw `fetch` against the Formance v2 HTTP API (no SDK dependency — simpler, stable).

- [ ] **Step 1: Write test that hits the real local ledger**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { LedgerClient } from "../src/ledger-client.js";

const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

// Create ledger if missing
beforeAll(async () => {
  await fetch(`${url}/v2/${ledger}`, { method: "POST" });
});

describe("LedgerClient (integration)", () => {
  const client = new LedgerClient(url, ledger);

  it("dry-runs a simple script and returns postings without writing", async () => {
    const r = await client.dryRun({
      plain: `send [USD/2 100] ( source = @mint:genesis allowing unbounded overdraft destination = @test:one )`,
      vars: {}
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.postings.length).toBe(1);
      expect(r.postings[0].amount).toBe(100);
    }
  });

  it("commits a script and returns a tx id", async () => {
    const ref = `test-${Date.now()}`;
    const r = await client.commit({
      plain: `send [USD/2 100] ( source = @mint:genesis allowing unbounded overdraft destination = @test:two )`,
      vars: {},
      reference: ref
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tx.id).toBeTruthy();
  });

  it("is idempotent on same reference (second commit returns existing tx)", async () => {
    const ref = `test-idem-${Date.now()}`;
    const script = {
      plain: `send [USD/2 50] ( source = @mint:genesis allowing unbounded overdraft destination = @test:idem )`,
      vars: {},
      reference: ref
    };
    const a = await client.commit(script);
    const b = await client.commit(script);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.tx.id).toBe(b.tx.id);
  });

  it("surfaces MissingFundsErr on overdraft", async () => {
    const r = await client.dryRun({
      plain: `send [USD/2 100] ( source = @nowhere destination = @test:three )`,
      vars: {}
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toMatch(/INSUFFICIENT|MISSING/i);
  });
});
```

- [ ] **Step 2: Write `packages/template-engine/src/ledger-client.ts`**

```ts
import type { LedgerPreview, LedgerTx } from "./types.js";

interface ScriptCall {
  plain: string;
  vars: Record<string, string>;
  reference?: string;
  metadata?: Record<string, string>;
}

export type LedgerResult<T> = { ok: true } & T | { ok: false; code: string; message: string };

export class LedgerClient {
  constructor(private baseUrl: string, private ledger: string) {}

  async dryRun(call: ScriptCall): Promise<LedgerResult<{ postings: LedgerPreview["postings"]; txMeta: Record<string, string> }>> {
    return this.post(call, true);
  }

  async commit(call: ScriptCall): Promise<LedgerResult<{ tx: LedgerTx }>> {
    const r = await this.post(call, false);
    if (!r.ok) return r;
    const body = r as any;
    return { ok: true, tx: body.tx };
  }

  private async post(call: ScriptCall, dryRun: boolean): Promise<any> {
    const qs = dryRun ? "?dry_run=true" : "";
    const res = await fetch(`${this.baseUrl}/v2/${this.ledger}/transactions${qs}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        script: { plain: call.plain, vars: call.vars },
        reference: call.reference,
        metadata: call.metadata
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, code: body.errorCode ?? `HTTP_${res.status}`, message: body.errorMessage ?? body.message ?? "ledger error" };
    }
    const data = body.data ?? body;
    const postings = (data.postings ?? []).map((p: any) => ({
      source: p.source, destination: p.destination, asset: p.asset, amount: Number(p.amount)
    }));
    const txMeta = data.metadata ?? {};
    const tx: LedgerTx = {
      id: String(data.id ?? data.txid ?? ""),
      timestamp: data.timestamp ?? new Date().toISOString(),
      postings, txMeta, accountMeta: {}
    };
    return { ok: true, postings, txMeta, tx };
  }
}
```

- [ ] **Step 3: Start ledger and run test**

```bash
pnpm ledger:up
cd packages/template-engine && pnpm test ledger-client
```

Expected: 4 tests pass. If your `@formance/ledger` image returns a different response shape, tweak `data = body.data ?? body;` and the `postings` unpack to match — then re-run.

- [ ] **Step 4: Commit**

```bash
git add packages/template-engine/src/ledger-client.ts packages/template-engine/test/ledger-client.test.ts
git commit -m "feat(template-engine): ledger client with dry-run + commit"
```

---

## Task 8: `invoke()` orchestration

**Files:**
- Create: `packages/template-engine/src/invoke.ts`, `packages/template-engine/src/index.ts`, `packages/template-engine/test/invoke.test.ts`

- [ ] **Step 1: Write failing test (uses fixtures from Task 4 + real ledger)**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { invoke } from "../src/invoke.js";
import { LedgerClient } from "../src/ledger-client.js";

const FIX = join(__dirname, "__fixtures__/invoke-templates");
const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

beforeAll(async () => {
  rmSync(FIX, { recursive: true, force: true });
  mkdirSync(join(FIX, "smoke"), { recursive: true });
  writeFileSync(join(FIX, "smoke/template.num"),
`vars { monetary $amount account $to }
send $amount ( source = @mint:genesis allowing unbounded overdraft destination = $to )
set_tx_meta("type", "SMOKE")`);
  writeFileSync(join(FIX, "smoke/schema.json"), JSON.stringify({
    id: "smoke",
    description: "smoke",
    params: {
      amount: { type: "monetary", asset: "USD/2", max: "1000_00" },
      to: { type: "account", pattern: "^@.+" }
    }
  }));
  writeFileSync(join(FIX, "smoke/example.json"), JSON.stringify({
    amount: { asset: "USD/2", amount: 100 },
    to: "@test:invoke"
  }));
  writeFileSync(join(FIX, "smoke/README.md"), "# smoke\n");
  await fetch(`${url}/v2/${ledger}`, { method: "POST" });
});

describe("invoke", () => {
  const client = new LedgerClient(url, ledger);

  it("end-to-end: loads, validates, renders, dry-runs, commits", async () => {
    const r = await invoke({
      rootDir: FIX,
      templateId: "smoke",
      params: { amount: { asset: "USD/2", amount: 100 }, to: "@test:invoke" },
      reference: `smoke-${Date.now()}`,
      client
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.committed?.id).toBeTruthy();
      expect(r.dryRun?.postings).toHaveLength(1);
      expect(r.dryRun?.postings[0].amount).toBe(100);
    }
  });

  it("rejects at validate phase when param exceeds schema max", async () => {
    const r = await invoke({
      rootDir: FIX,
      templateId: "smoke",
      params: { amount: { asset: "USD/2", amount: 999999999 }, to: "@test:invoke" },
      reference: `bad-${Date.now()}`,
      client
    });
    expect(r.ok).toBe(false);
    expect(r.error?.phase).toBe("validate");
    expect(r.error?.code).toBe("BoundsError");
  });
});
```

- [ ] **Step 2: Write `packages/template-engine/src/invoke.ts`**

```ts
import { loadTemplate } from "./loader.js";
import { validateParams } from "./validator.js";
import { renderVars } from "./renderer.js";
import { LedgerClient } from "./ledger-client.js";
import type { InvokeResult, ParamValue } from "./types.js";

export interface InvokeOptions {
  rootDir: string;
  templateId: string;
  params: Record<string, ParamValue>;
  reference?: string;
  client: LedgerClient;
}

export async function invoke(opts: InvokeOptions): Promise<InvokeResult> {
  const { rootDir, templateId, params, reference, client } = opts;

  let template;
  try {
    template = await loadTemplate(rootDir, templateId);
  } catch (e: any) {
    return {
      ok: false, templateId, params, renderedNumscript: "",
      error: { phase: "load", code: "TemplateNotFound", message: e.message }
    };
  }

  const validation = validateParams(template.schema, params);
  if (!validation.ok) {
    return { ok: false, templateId, params, renderedNumscript: template.source, error: validation.error };
  }

  const vars = renderVars(template.schema, params);

  const dry = await client.dryRun({ plain: template.source, vars, reference });
  if (!dry.ok) {
    return {
      ok: false, templateId, params, renderedNumscript: template.source,
      error: { phase: "dry-run", code: dry.code, message: dry.message }
    };
  }
  const dryRun = { postings: dry.postings, txMeta: dry.txMeta, accountMeta: {} };

  const committed = await client.commit({ plain: template.source, vars, reference });
  if (!committed.ok) {
    return {
      ok: true === false ? true : false, // explicit: commit failed
      templateId, params, renderedNumscript: template.source, dryRun,
      error: { phase: "commit", code: committed.code, message: committed.message }
    };
  }

  return {
    ok: true, templateId, params, renderedNumscript: template.source,
    dryRun, committed: committed.tx
  };
}
```

- [ ] **Step 3: Write `packages/template-engine/src/index.ts`**

```ts
export * from "./types.js";
export { loadTemplate, loadTemplates } from "./loader.js";
export { validateParams } from "./validator.js";
export { renderVars } from "./renderer.js";
export { LedgerClient } from "./ledger-client.js";
export { invoke } from "./invoke.js";
```

- [ ] **Step 4: Run test — should pass**

```bash
pnpm test invoke
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/template-engine/src/invoke.ts packages/template-engine/src/index.ts packages/template-engine/test/invoke.test.ts
git commit -m "feat(template-engine): invoke() end-to-end"
```

---

## Notes on template authoring (applies to Tasks 9–13)

Each of the 13 templates follows the same structure:

1. `templates/<id>/template.num` — the Numscript source
2. `templates/<id>/schema.json` — shape matching `TemplateSchema` in `types.ts`
3. `templates/<id>/example.json` — realistic params used by CI
4. `templates/<id>/README.md` — one-paragraph explainer + the Numscript feature it showcases

**Every template's Numscript MUST end with `set_tx_meta("type", "<UPPER_SNAKE_ID>")`** so tx filtering by template works in the explorer.

**No `@world` in any template.** Genesis funding is a separate seeding script (Task 16). Runtime flows move money only between `@agents:*`, `@platform:*`, `@escrow:*`.

**Test pattern per template** (create `templates/<id>/__test__.spec.ts` — one file per template):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { invoke, LedgerClient } from "@nac/template-engine";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ID = "<id>";  // replace per template
const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

beforeAll(async () => {
  await fetch(`${url}/v2/${ledger}`, { method: "POST" });
  // Seed any accounts this template's example needs, via genesis:
  // (one helper from Task 16 we'll factor out: seed(accounts, amount))
});

describe(`template ${ID}`, () => {
  const client = new LedgerClient(url, ledger);
  it("runs with example.json params", async () => {
    const example = await import(`../${ID}/example.json`, { assert: { type: "json" } });
    const r = await invoke({
      rootDir: ROOT, templateId: ID, params: example.default,
      reference: `${ID}-${Date.now()}`, client
    });
    expect(r.ok).toBe(true);
  });
});
```

The seeding helper referenced above is defined in Task 16; do Task 16 before Tasks 9–13 if you want each template's own test to run cleanly. (Alternative: run Task 15 Playground-API validation instead of live-ledger tests in each template task, and defer live tests to Task 17.)

---

## Task 9: Templates — `p2p_transfer` and `gig_settlement`

**Files (create):**
- `templates/p2p_transfer/{template.num, schema.json, example.json, README.md}`
- `templates/gig_settlement/{template.num, schema.json, example.json, README.md}`

### 9a — `p2p_transfer`

- [ ] **Step 1: `templates/p2p_transfer/template.num`**

```numscript
vars {
  monetary $amount
  account  $from
  account  $to
  string   $memo
}

send $amount (
  source      = $from
  destination = $to
)

set_tx_meta("type", "P2P_TRANSFER")
set_tx_meta("memo", $memo)
```

- [ ] **Step 2: `templates/p2p_transfer/schema.json`**

```json
{
  "id": "p2p_transfer",
  "description": "Direct payment from one agent to another. Source-bounded — cannot overdraft.",
  "params": {
    "amount": { "type": "monetary", "asset": "USD/2", "max": "1000_00", "min": "1" },
    "from":   { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "to":     { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "memo":   { "type": "string",   "maxLength": 140 }
  }
}
```

- [ ] **Step 3: `templates/p2p_transfer/example.json`**

```json
{
  "amount": { "asset": "USD/2", "amount": 250 },
  "from":   "@agents:001:available",
  "to":     "@agents:002:available",
  "memo":   "lunch reimbursement"
}
```

- [ ] **Step 4: `templates/p2p_transfer/README.md`**

```markdown
# p2p_transfer

Direct payment from one agent's `available` balance to another's.

## Numscript feature on display
**Source-bounded overdraft enforcement.** `$from` has no `allowing overdraft` clause, so the ledger refuses the transaction if `$from` doesn't have the funds. No bypass possible from the LLM side — the template source is fixed.
```

### 9b — `gig_settlement`

- [ ] **Step 1: `templates/gig_settlement/template.num`**

```numscript
vars {
  monetary $amount
  account  $payer
  account  $winner
  account  $platform
  portion  $platform_fee
  account  $reviewer
  portion  $reviewer_fee
  string   $job_ref
}

send $amount (
  source      = $payer
  destination = {
    $platform_fee to $platform
    $reviewer_fee to $reviewer
    remaining     to $winner
  }
)

set_tx_meta("type",    "GIG_SETTLEMENT")
set_tx_meta("job_ref", $job_ref)
set_tx_meta("payer",   $payer)
set_tx_meta("winner",  $winner)
```

- [ ] **Step 2: `templates/gig_settlement/schema.json`**

```json
{
  "id": "gig_settlement",
  "description": "Settle a completed gig: pay winner with platform + reviewer fees, atomically.",
  "params": {
    "amount":       { "type": "monetary", "asset": "USD/2", "max": "1000_00", "min": "1" },
    "payer":        { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "winner":       { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "platform":     { "type": "account",  "const":   "@platform:revenue:fees" },
    "platform_fee": { "type": "portion",  "max": "20%" },
    "reviewer":     { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "reviewer_fee": { "type": "portion",  "max": "10%" },
    "job_ref":      { "type": "string",   "maxLength": 64 }
  }
}
```

- [ ] **Step 3: `templates/gig_settlement/example.json`**

```json
{
  "amount":       { "asset": "USD/2", "amount": 100 },
  "payer":        "@agents:003:available",
  "winner":       "@agents:002:available",
  "platform":     "@platform:revenue:fees",
  "platform_fee": "5%",
  "reviewer":     "@agents:004:available",
  "reviewer_fee": "5%",
  "job_ref":      "gig-001"
}
```

- [ ] **Step 4: `templates/gig_settlement/README.md`**

```markdown
# gig_settlement

Pay a gig winner with a platform fee and a reviewer fee, all atomically.

## Numscript feature on display
**Atomic multi-party allotment.** Exactly one `send` produces three postings; they either all commit or all revert. Allotment sums are validated at compile time (schema caps enforce `platform_fee ≤ 20%`, `reviewer_fee ≤ 10%`, which with `remaining` cannot exceed 100%).
```

- [ ] **Step 5: Commit**

```bash
git add templates/p2p_transfer templates/gig_settlement
git commit -m "feat(templates): p2p_transfer + gig_settlement"
```

---

## Task 10: Templates — `escrow_hold` / `escrow_release` / `escrow_refund`

### 10a — `escrow_hold`

- [ ] **`templates/escrow_hold/template.num`**

```numscript
vars {
  monetary $amount
  account  $payer
  account  $escrow
  string   $job_ref
}

send $amount (
  source      = $payer
  destination = $escrow
)

set_tx_meta("type",    "ESCROW_HOLD")
set_tx_meta("job_ref", $job_ref)
set_tx_meta("payer",   $payer)
```

- [ ] **`templates/escrow_hold/schema.json`**

```json
{
  "id": "escrow_hold",
  "description": "Lock payer's funds in a per-job escrow account. Idempotent via `reference`.",
  "params": {
    "amount":  { "type": "monetary", "asset": "USD/2", "max": "1000_00", "min": "1" },
    "payer":   { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "escrow":  { "type": "account",  "pattern": "^@escrow:job:[a-zA-Z0-9-]+$" },
    "job_ref": { "type": "string",   "maxLength": 64 }
  }
}
```

- [ ] **`templates/escrow_hold/example.json`**

```json
{
  "amount":  { "asset": "USD/2", "amount": 500 },
  "payer":   "@agents:003:available",
  "escrow":  "@escrow:job:gig-002",
  "job_ref": "gig-002"
}
```

- [ ] **`templates/escrow_hold/README.md`**

```markdown
# escrow_hold

Lock `$amount` of `$payer`'s funds into a per-job escrow account (`@escrow:job:{id}`).

## Numscript feature on display
**Idempotency via `reference`.** The template engine always invokes with `reference = {agent}:{tick_id}`; replaying the same call returns the original tx id instead of double-locking funds. Escrow lives outside the agent tree so wildcard balances on `@agents:` stay accurate.
```

### 10b — `escrow_release`

- [ ] **`templates/escrow_release/template.num`**

```numscript
vars {
  account $escrow
  account $winner
  string  $job_ref
}

send [USD/2 *] (
  source      = $escrow
  destination = $winner
)

set_tx_meta("type",    "ESCROW_RELEASE")
set_tx_meta("job_ref", $job_ref)
set_tx_meta("winner",  $winner)
```

- [ ] **`templates/escrow_release/schema.json`**

```json
{
  "id": "escrow_release",
  "description": "Release the full escrow balance to the winner. Wildcard send sweeps all USD/2.",
  "params": {
    "escrow":  { "type": "account", "pattern": "^@escrow:job:[a-zA-Z0-9-]+$" },
    "winner":  { "type": "account", "pattern": "^@agents:[0-9]+:available$" },
    "job_ref": { "type": "string",  "maxLength": 64 }
  }
}
```

- [ ] **`templates/escrow_release/example.json`**

```json
{
  "escrow":  "@escrow:job:gig-002",
  "winner":  "@agents:002:available",
  "job_ref": "gig-002"
}
```

- [ ] **`templates/escrow_release/README.md`**

```markdown
# escrow_release

Sweep the full escrow balance to the winner, atomically.

## Numscript feature on display
**`send [ASSET *]` wildcard** drains the exact balance without needing to pre-compute — avoids a race where balance queried on the app side drifts before commit.
```

### 10c — `escrow_refund`

- [ ] **`templates/escrow_refund/template.num`**

```numscript
vars {
  account $escrow
  account $payer
  string  $job_ref
}

send [USD/2 *] (
  source      = $escrow
  destination = $payer
)

set_tx_meta("type",    "ESCROW_REFUND")
set_tx_meta("job_ref", $job_ref)
set_tx_meta("payer",   $payer)
```

- [ ] **`templates/escrow_refund/schema.json`**

```json
{
  "id": "escrow_refund",
  "description": "Return full escrow balance to the original payer (dispute / cancellation path).",
  "params": {
    "escrow":  { "type": "account", "pattern": "^@escrow:job:[a-zA-Z0-9-]+$" },
    "payer":   { "type": "account", "pattern": "^@agents:[0-9]+:available$" },
    "job_ref": { "type": "string",  "maxLength": 64 }
  }
}
```

- [ ] **`templates/escrow_refund/example.json`**

```json
{
  "escrow":  "@escrow:job:gig-003",
  "payer":   "@agents:003:available",
  "job_ref": "gig-003"
}
```

- [ ] **`templates/escrow_refund/README.md`**

```markdown
# escrow_refund

Return the full escrow balance to the original payer.

## Numscript feature on display
**Symmetric with `escrow_release`** — same shape, different destination. The choice of whether to release or refund is made at the invocation layer, not inside Numscript: templates are narrow, composable primitives.
```

- [ ] **Commit**

```bash
git add templates/escrow_hold templates/escrow_release templates/escrow_refund
git commit -m "feat(templates): escrow_hold + escrow_release + escrow_refund"
```

---

## Task 11: Templates — `api_call_fee` / `subscription_charge` / `refund`

### 11a — `api_call_fee` (metadata-driven pricing)

- [ ] **`templates/api_call_fee/template.num`**

```numscript
vars {
  account  $caller
  account  $provider
  monetary $unit_price = meta($provider, "unit_price")
  number   $units
  string   $call_ref
}

send mul($unit_price, $units) (
  source      = $caller
  destination = $provider
)

set_tx_meta("type",     "API_CALL_FEE")
set_tx_meta("call_ref", $call_ref)
set_tx_meta("units",    $units)
```

- [ ] **`templates/api_call_fee/schema.json`**

```json
{
  "id": "api_call_fee",
  "description": "Pay a provider for N calls at a price read from the provider's account metadata.",
  "params": {
    "caller":   { "type": "account", "pattern": "^@agents:[0-9]+:available$" },
    "provider": { "type": "account", "pattern": "^@agents:[0-9]+:available$" },
    "units":    { "type": "number",  "minimum": 1, "maximum": 10000 },
    "call_ref": { "type": "string",  "maxLength": 64 }
  }
}
```

- [ ] **`templates/api_call_fee/example.json`**

```json
{
  "caller":   "@agents:002:available",
  "provider": "@agents:005:available",
  "units":    10,
  "call_ref": "req-abc"
}
```

- [ ] **`templates/api_call_fee/README.md`**

```markdown
# api_call_fee

Caller pays provider for N units at a price the provider publishes to its own account metadata.

## Numscript feature on display
**`meta(account, key)` reads on-ledger policy.** The price is not in the prompt and cannot be hallucinated. If a provider changes its `unit_price` metadata, future calls price automatically. One source of truth.

## Prerequisite
The provider account must have `unit_price` metadata set (e.g. `{ "type": "monetary", "value": { "asset": "USD/2", "amount": 2 } }`). Seed script (Task 16) does this for all agents.
```

### 11b — `subscription_charge`

- [ ] **`templates/subscription_charge/template.num`**

```numscript
vars {
  monetary $amount
  account  $subscriber
  account  $provider
  string   $period_ref
}

send $amount (
  source      = $subscriber
  destination = $provider
)

set_tx_meta("type",       "SUBSCRIPTION_CHARGE")
set_tx_meta("period_ref", $period_ref)
```

- [ ] **`templates/subscription_charge/schema.json`**

```json
{
  "id": "subscription_charge",
  "description": "Recurring charge keyed by period. Idempotent — invoking twice for the same period_ref is a no-op.",
  "params": {
    "amount":     { "type": "monetary", "asset": "USD/2", "max": "200_00", "min": "1" },
    "subscriber": { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "provider":   { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "period_ref": { "type": "string",   "pattern": "^[a-zA-Z0-9_-]+:[0-9]{4}-[0-9]{2}-[0-9]{2}$", "maxLength": 64 }
  }
}
```

- [ ] **`templates/subscription_charge/example.json`**

```json
{
  "amount":     { "asset": "USD/2", "amount": 500 },
  "subscriber": "@agents:002:available",
  "provider":   "@agents:004:available",
  "period_ref": "sub-dave:2026-04-01"
}
```

- [ ] **`templates/subscription_charge/README.md`**

```markdown
# subscription_charge

Recurring payment. The engine invokes with `reference = period_ref`, so a replay of the same period is idempotent.

## Numscript feature on display
**Ledger-level `reference` idempotency.** Double-charging a subscription is architecturally impossible — the ledger returns the original tx id if the reference exists.
```

### 11c — `refund`

- [ ] **`templates/refund/template.num`**

```numscript
vars {
  monetary $amount
  account  $merchant
  account  $customer
  string   $original_tx_ref
}

send $amount (
  source      = $merchant
  destination = $customer
)

set_tx_meta("type",            "REFUND")
set_tx_meta("original_tx_ref", $original_tx_ref)
```

- [ ] **`templates/refund/schema.json`**

```json
{
  "id": "refund",
  "description": "Idempotent refund keyed by the original tx reference.",
  "params": {
    "amount":          { "type": "monetary", "asset": "USD/2", "max": "1000_00", "min": "1" },
    "merchant":        { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "customer":        { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "original_tx_ref": { "type": "string",   "maxLength": 64 }
  }
}
```

- [ ] **`templates/refund/example.json`**

```json
{
  "amount":          { "asset": "USD/2", "amount": 250 },
  "merchant":        "@agents:007:available",
  "customer":        "@agents:002:available",
  "original_tx_ref": "gig-001"
}
```

- [ ] **`templates/refund/README.md`**

```markdown
# refund

Merchant refunds a customer. Idempotent — invoked with `reference = refund:{original_tx_ref}`.

## Numscript feature on display
**Idempotency + typed params.** Schema forces `amount` into minor units with a cap, so LLM-emitted floats or surprise-large refunds are rejected before the ledger sees them.
```

- [ ] **Commit**

```bash
git add templates/api_call_fee templates/subscription_charge templates/refund
git commit -m "feat(templates): api_call_fee + subscription_charge + refund"
```

---

## Task 12: Templates — `revenue_split` / `dispute_arbitration`

### 12a — `revenue_split` (uses `distribute()` — experimental flag required)

The stock Numscript interpreter gates `distribute()` behind `experimental-yield-distribution`. The Formance Ledger v2 image ships with the flag enabled by default; verify by checking the ledger image release notes. If disabled in your build, set env `NUMSCRIPT_EXPERIMENTAL=1` on the ledger container.

- [ ] **`templates/revenue_split/template.num`**

```numscript
vars {
  account      $pool
  account_list $recipients
  monetary     $total = balance($pool, USD/2)
  string       $round_ref
}

distribute($total, $pool, $recipients, USD/2)

set_tx_meta("type",      "REVENUE_SPLIT")
set_tx_meta("round_ref", $round_ref)
```

- [ ] **`templates/revenue_split/schema.json`**

```json
{
  "id": "revenue_split",
  "description": "Distribute a pool's full USD/2 balance to N recipients proportionally to their current balances.",
  "params": {
    "pool":       { "type": "account", "pattern": "^@platform:pool:[a-zA-Z0-9-]+$" },
    "recipients": { "type": "string",  "pattern": "^[a-zA-Z0-9:*]+$", "maxLength": 64, "description": "Wildcard pattern like 'agents:*:available'" },
    "round_ref":  { "type": "string",  "maxLength": 64 }
  }
}
```

Note: the `account_list` param is expressed server-side as `accounts("<pattern>")`. Our schema uses a `string` pattern and the **renderer needs a small extension** for account_list vars — see "Task 12c patch to renderer" below.

- [ ] **`templates/revenue_split/example.json`**

```json
{
  "pool":       "@platform:pool:yield",
  "recipients": "agents:*:available",
  "round_ref":  "yield:2026-04-21"
}
```

- [ ] **`templates/revenue_split/README.md`**

```markdown
# revenue_split

Pay out a pool's entire balance to all accounts matching a wildcard, proportionally to their own balances.

## Numscript feature on display
**`distribute()` + `accounts("pattern")` wildcard expansion.** One statement does what would otherwise be N agent-side balance queries and N send statements — atomically, without the race.
```

### 12b — `dispute_arbitration`

- [ ] **`templates/dispute_arbitration/template.num`**

```numscript
vars {
  monetary $funds
  account  $source
  account  $party_a
  account  $party_b
  portion  $a_portion
  string   $dispute_ref
}

send $funds (
  source      = $source
  destination = {
    $a_portion to $party_a
    remaining  to $party_b
  }
)

set_tx_meta("type",         "DISPUTE_ARBITRATION")
set_tx_meta("dispute_ref",  $dispute_ref)
set_tx_meta("party_a",      $party_a)
set_tx_meta("party_b",      $party_b)
```

- [ ] **`templates/dispute_arbitration/schema.json`**

```json
{
  "id": "dispute_arbitration",
  "description": "Split contested funds atomically between two parties by portion.",
  "params": {
    "funds":       { "type": "monetary", "asset": "USD/2", "max": "1000_00", "min": "1" },
    "source":      { "type": "account",  "pattern": "^@(escrow|agents):.+$" },
    "party_a":     { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "party_b":     { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "a_portion":   { "type": "portion",  "min": "0%", "max": "100%" },
    "dispute_ref": { "type": "string",   "maxLength": 64 }
  }
}
```

- [ ] **`templates/dispute_arbitration/example.json`**

```json
{
  "funds":       { "asset": "USD/2", "amount": 800 },
  "source":      "@escrow:job:gig-004",
  "party_a":     "@agents:003:available",
  "party_b":     "@agents:002:available",
  "a_portion":   "60%",
  "dispute_ref": "disp-001"
}
```

- [ ] **`templates/dispute_arbitration/README.md`**

```markdown
# dispute_arbitration

Atomically split contested funds between two parties. Ivan (the Disputant) invokes this.

## Numscript feature on display
**Portion math + `remaining`.** Allotment sums to 100% is validated at parse time — an agent can't accidentally under-allocate.
```

### 12c — Renderer patch: `account_list` support

**Files:**
- Modify: `packages/template-engine/src/types.ts`, `packages/template-engine/src/renderer.ts`, `packages/template-engine/src/validator.ts`, `packages/template-engine/test/renderer.test.ts`

- [ ] **Step 1: Extend `ParamSpec` in `types.ts` (add to the union):**

```ts
  | { type: "account_list"; pattern?: string; description?: string };
```

(The existing `validator.ts` will need a case added; the change is trivial and mirrors the `string` case but with no transformation.)

- [ ] **Step 2: Extend `renderer.ts` — add to the `switch` in `renderVars`:**

```ts
      case "account_list": {
        // Numscript expects: accounts("agents:*:available")
        const s = v as string;
        vars[name] = `accounts("${s}")`;
        break;
      }
```

- [ ] **Step 3: Extend `validator.ts` — add to the `switch`:**

```ts
      case "account_list": {
        if (typeof v !== "string") {
          return { ok: false, error: err("TypeMismatch", `${name} must be string (wildcard pattern)`) };
        }
        if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(v)) {
          return { ok: false, error: err("PatternMismatch", `${name} does not match pattern ${spec.pattern}`) };
        }
        break;
      }
```

- [ ] **Step 4: Add renderer test**

Append to `renderer.test.ts`:

```ts
it("renders account_list as accounts(\"pattern\")", () => {
  const s: TemplateSchema = { id: "t", description: "t", params: { list: { type: "account_list" } } };
  const v = renderVars(s, { list: "agents:*:available" });
  expect(v).toEqual({ list: 'accounts("agents:*:available")' });
});
```

- [ ] **Step 5: Run tests — all pass**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/template-engine templates/revenue_split templates/dispute_arbitration
git commit -m "feat(templates): revenue_split + dispute_arbitration; engine: account_list vars"
```

---

## Task 13: Templates — `waterfall_pay` / `credit_line_charge` / `liquidate_wallet`

### 13a — `waterfall_pay`

- [ ] **`templates/waterfall_pay/template.num`**

```numscript
vars {
  monetary $amount
  account  $agent_credits
  account  $agent_earnings
  account  $agent_main
  account  $to
  string   $memo
}

send $amount (
  source      = {
    $agent_credits
    $agent_earnings
    $agent_main
  }
  destination = $to
)

set_tx_meta("type", "WATERFALL_PAY")
set_tx_meta("memo", $memo)
```

- [ ] **`templates/waterfall_pay/schema.json`**

```json
{
  "id": "waterfall_pay",
  "description": "Pay from an agent's buckets in priority order: promo credits → earnings → main balance.",
  "params": {
    "amount":          { "type": "monetary", "asset": "USD/2", "max": "1000_00", "min": "1" },
    "agent_credits":   { "type": "account",  "pattern": "^@agents:[0-9]+:credits$" },
    "agent_earnings":  { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "agent_main":      { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "to":              { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "memo":            { "type": "string",   "maxLength": 140 }
  }
}
```

- [ ] **`templates/waterfall_pay/example.json`**

```json
{
  "amount":         { "asset": "USD/2", "amount": 300 },
  "agent_credits":  "@agents:002:credits",
  "agent_earnings": "@agents:002:available",
  "agent_main":     "@agents:002:available",
  "to":             "@agents:005:available",
  "memo":           "api bundle"
}
```

- [ ] **`templates/waterfall_pay/README.md`**

```markdown
# waterfall_pay

Pay from a priority-ordered cascade of the sender's accounts. Promo credits go first, earnings next, main balance last.

## Numscript feature on display
**Cascading sources.** One statement drains accounts in order until the required amount is met. The fallback behavior is ledger-native — no app-side balance arithmetic.
```

### 13b — `credit_line_charge`

- [ ] **`templates/credit_line_charge/template.num`**

```numscript
vars {
  monetary $amount
  account  $agent_credit
  monetary $credit_limit
  account  $agent_main
  account  $to
  string   $memo
}

send $amount (
  source      = {
    $agent_credit allowing overdraft up to $credit_limit
    $agent_main
  }
  destination = $to
)

set_tx_meta("type", "CREDIT_LINE_CHARGE")
set_tx_meta("memo", $memo)
```

- [ ] **`templates/credit_line_charge/schema.json`**

```json
{
  "id": "credit_line_charge",
  "description": "Purchase uses bounded credit line first (up to credit_limit), then falls back to main balance.",
  "params": {
    "amount":       { "type": "monetary", "asset": "USD/2", "max": "1000_00", "min": "1" },
    "agent_credit": { "type": "account",  "pattern": "^@agents:[0-9]+:credit$" },
    "credit_limit": { "type": "monetary", "asset": "USD/2", "max": "500_00", "min": "0" },
    "agent_main":   { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "to":           { "type": "account",  "pattern": "^@agents:[0-9]+:available$" },
    "memo":         { "type": "string",   "maxLength": 140 }
  }
}
```

- [ ] **`templates/credit_line_charge/example.json`**

```json
{
  "amount":       { "asset": "USD/2", "amount": 300 },
  "agent_credit": "@agents:002:credit",
  "credit_limit": { "asset": "USD/2", "amount": 10000 },
  "agent_main":   "@agents:002:available",
  "to":           "@agents:005:available",
  "memo":         "research bundle"
}
```

- [ ] **`templates/credit_line_charge/README.md`**

```markdown
# credit_line_charge

Draw from a bounded credit line first (up to `$credit_limit`), then fall back to main balance.

## Numscript feature on display
**Bounded overdraft as a feature.** The same primitive that refuses theft (unbounded overdraft → MissingFundsErr) enables legitimate credit when the caller explicitly bounds the negative range. Dave the Lender uses this to extend credit to trusted peers.
```

### 13c — `liquidate_wallet`

- [ ] **`templates/liquidate_wallet/template.num`**

```numscript
vars {
  account $from
  account $to
  string  $reason
}

send [USD/2 *] (
  source      = $from
  destination = $to
)

set_tx_meta("type",   "LIQUIDATE_WALLET")
set_tx_meta("from",   $from)
set_tx_meta("reason", $reason)
```

- [ ] **`templates/liquidate_wallet/schema.json`**

```json
{
  "id": "liquidate_wallet",
  "description": "Drain an agent's full USD/2 balance to a target. Used for bankruptcy or role change.",
  "params": {
    "from":   { "type": "account", "pattern": "^@agents:[0-9]+:available$" },
    "to":     { "type": "account", "pattern": "^@agents:[0-9]+:available$" },
    "reason": { "type": "string",  "maxLength": 140 }
  }
}
```

- [ ] **`templates/liquidate_wallet/example.json`**

```json
{
  "from":   "@agents:009:available",
  "to":     "@agents:001:available",
  "reason": "role retired"
}
```

- [ ] **`templates/liquidate_wallet/README.md`**

```markdown
# liquidate_wallet

Drain the caller's entire USD/2 balance to a target account.

## Numscript feature on display
**`send [ASSET *]` wildcard.** No separate "what's my balance" query needed — the ledger computes it at commit time. Deterministic liquidation.
```

- [ ] **Commit**

```bash
git add templates/waterfall_pay templates/credit_line_charge templates/liquidate_wallet
git commit -m "feat(templates): waterfall_pay + credit_line_charge + liquidate_wallet"
```

---

## Task 14: CLI (`pnpm run-template`)

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/run-template.ts`

- [ ] **Step 1: Write `packages/cli/package.json`**

```json
{
  "name": "@nac/cli",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "run-template": "tsx src/run-template.ts",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@nac/template-engine": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.2"
  }
}
```

- [ ] **Step 2: Write `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/cli/src/run-template.ts`**

```ts
#!/usr/bin/env tsx
import { invoke, LedgerClient, loadTemplate } from "@nac/template-engine";
import { resolve } from "node:path";

function usage(): never {
  console.error(`Usage:
  pnpm run-template <id> --example
  pnpm run-template <id> --param <name>=<value> [--param ...]
  pnpm run-template <id> --params-json <json-string>

Values for monetary params: "USD/2:100"  (asset:minor-units)
Values for portion params:  "5%" or "1/3"
Everything else:            pass as a string.
`);
  process.exit(2);
}

function parseValue(raw: string): unknown {
  if (/^[A-Z]+\/\d+:\d+$/.test(raw)) {
    const [assetPart, amount] = raw.split(":");
    return { asset: assetPart, amount: Number(amount) };
  }
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

async function main() {
  const [, , id, ...rest] = process.argv;
  if (!id) usage();

  const rootDir = resolve(process.cwd(), "templates");
  const template = await loadTemplate(rootDir, id);

  let params: Record<string, unknown>;
  if (rest.includes("--example")) {
    params = template.example;
  } else if (rest.includes("--params-json")) {
    const idx = rest.indexOf("--params-json");
    params = JSON.parse(rest[idx + 1]);
  } else {
    params = {};
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--param") {
        const [k, v] = rest[i + 1].split("=", 2);
        params[k] = parseValue(v);
        i++;
      }
    }
  }

  const url = process.env.LEDGER_URL ?? "http://localhost:3068";
  const ledger = process.env.LEDGER_NAME ?? "city";
  const client = new LedgerClient(url, ledger);

  const r = await invoke({
    rootDir, templateId: id, params: params as any,
    reference: `cli-${Date.now()}`, client
  });

  if (r.ok) {
    console.log("✓ committed", r.committed?.id);
    console.log("postings:", JSON.stringify(r.dryRun?.postings, null, 2));
  } else {
    console.error(`✗ ${r.error?.phase}: ${r.error?.code} — ${r.error?.message}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Install and smoke-test (local ledger running, genesis seeded later — may fail MissingFundsErr, that's fine here)**

```bash
pnpm install
pnpm run-template p2p_transfer --example
```

Expected: Either `✓ committed <id>` (if accounts exist) or `✗ commit: INSUFFICIENT_FUND ...` — both prove the pipeline works; fund seeding is Task 16.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): run-template command"
```

---

## Task 15: CI — validate every template against the Playground API

**Files:**
- Create: `scripts/validate-templates.ts`, `.github/workflows/validate-templates.yml`

The Numscript Playground API (`https://numscript-playground-api-prod.fly.dev/run`) accepts `{script, balances, metadata, variables, featureFlags}` and returns `{ok, value|error}`. We use it for **syntax + semantic validation** (without mutating any real ledger) on every commit.

- [ ] **Step 1: Write `scripts/validate-templates.ts`**

```ts
#!/usr/bin/env tsx
import { loadTemplates } from "@nac/template-engine";
import { renderVars } from "@nac/template-engine";
import { validateParams } from "@nac/template-engine";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const PG = "https://numscript-playground-api-prod.fly.dev/run";

type Balance = { [account: string]: { [asset: string]: number } };

// Seed balances large enough for any example to succeed.
function seedBalances(vars: Record<string, string>): Balance {
  const b: Balance = {};
  for (const v of Object.values(vars)) {
    // Take account-like strings from vars and seed them $10,000 USD/2
    if (/^[a-zA-Z0-9_]+(:[a-zA-Z0-9_]+)+$/.test(v)) {
      b[v] = { "USD/2": 1_000_000 };
    }
  }
  // Always seed genesis
  b["mint:genesis"] = { "USD/2": 100_000_000_000 };
  return b;
}

function seedMetadata(vars: Record<string, string>): Record<string, Record<string, unknown>> {
  // For api_call_fee we need a unit_price on the provider
  const md: Record<string, Record<string, unknown>> = {};
  for (const v of Object.values(vars)) {
    if (/^agents:[0-9]+:available$/.test(v)) {
      md[v] = { unit_price: { type: "monetary", value: { asset: "USD/2", amount: 2 } } };
    }
  }
  return md;
}

async function main() {
  const rootDir = resolve(process.cwd(), "templates");
  const templates = await loadTemplates(rootDir);
  let failed = 0;

  for (const t of templates) {
    const vcheck = validateParams(t.schema, t.example as any);
    if (!vcheck.ok) {
      console.error(`✗ ${t.id}: example fails schema validation — ${vcheck.error.message}`);
      failed++;
      continue;
    }

    const vars = renderVars(t.schema, t.example as any);
    const payload = {
      script: t.source,
      balances: seedBalances(vars),
      metadata: seedMetadata(vars),
      variables: vars,
      featureFlags: ["experimental-yield-distribution", "experimental-account-interpolation"]
    };

    const res = await fetch(PG, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      console.error(`✗ ${t.id}: ${body.error ?? `HTTP ${res.status}`}`);
      failed++;
      continue;
    }
    console.log(`✓ ${t.id} (${body.value.postings.length} postings)`);
  }

  if (failed) {
    console.error(`\n${failed} template(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${templates.length} templates validated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it locally**

```bash
pnpm validate-templates
```

Expected: `All 13 templates validated.`

If a template fails — most likely cases: missing feature flag, experimental syntax (`distribute()`), or a seed balance that wasn't picked up. Fix the failing template, re-run.

- [ ] **Step 3: Write `.github/workflows/validate-templates.yml`**

```yaml
name: validate-templates

on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm validate-templates
```

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-templates.ts .github/workflows/validate-templates.yml
git commit -m "ci: validate every template against the Numscript Playground API"
```

---

## Task 16: Genesis seeding script

**Files:**
- Create: `scripts/seed-genesis.ts`

Seeds 10 agent accounts + platform + escrow scaffolding + provider metadata for `api_call_fee`. Uses the one authorized use of unbounded overdraft (`@mint:genesis`) — this script is the ONLY place it appears.

- [ ] **Step 1: Write `scripts/seed-genesis.ts`**

```ts
#!/usr/bin/env tsx
import { LedgerClient } from "@nac/template-engine";

const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";
const client = new LedgerClient(url, ledger);

// Ensure ledger exists
await fetch(`${url}/v2/${ledger}`, { method: "POST" });

const agents = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(3, "0"));
const agentAvailable = (id: string) => `@agents:${id}:available`;

// Seed each agent with $100
for (const id of agents) {
  const ref = `genesis:agents:${id}:available`;
  const r = await client.commit({
    plain: `send [USD/2 10000] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = ${agentAvailable(id)}
)
set_tx_meta("type", "GENESIS_SEED")
set_tx_meta("agent", "${id}")`,
    vars: {},
    reference: ref
  });
  if (!r.ok) console.error(`seed ${id}: ${r.code} ${r.message}`);
  else console.log(`✓ seeded agent ${id}`);
}

// Platform treasury $1,200
{
  const r = await client.commit({
    plain: `send [USD/2 120000] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = @platform:treasury:main
)
set_tx_meta("type", "GENESIS_SEED")
set_tx_meta("account", "platform:treasury:main")`,
    vars: {},
    reference: "genesis:platform:treasury"
  });
  if (r.ok) console.log("✓ seeded platform:treasury:main");
}

// Set unit_price on each agent (so api_call_fee has a price to read)
// Unit price: agents with odd id → $0.02, even → $0.05
for (const id of agents) {
  const price = Number(id) % 2 === 0 ? 5 : 2;
  const res = await fetch(`${url}/v2/${ledger}/accounts/agents:${id}:available/metadata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      unit_price: { type: "monetary", value: { asset: "USD/2", amount: price } }
    })
  });
  if (!res.ok) console.error(`meta ${id}: HTTP ${res.status}`);
  else console.log(`✓ set unit_price=${price}¢ on agent ${id}`);
}

// Seed the yield pool with $500 (for revenue_split demonstrations)
{
  const r = await client.commit({
    plain: `send [USD/2 50000] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = @platform:pool:yield
)
set_tx_meta("type", "GENESIS_SEED")`,
    vars: {},
    reference: "genesis:pool:yield"
  });
  if (r.ok) console.log("✓ seeded platform:pool:yield");
}

console.log("\nGenesis complete.");
```

- [ ] **Step 2: Run it**

```bash
pnpm seed-genesis
```

Expected output:

```
✓ seeded agent 001
✓ seeded agent 002
... (10 agents)
✓ seeded platform:treasury:main
✓ set unit_price=2¢ on agent 001
... (10 agents)
✓ seeded platform:pool:yield

Genesis complete.
```

- [ ] **Step 3: Verify balances**

```bash
curl -s "http://localhost:3068/v2/city/aggregate/balances?address=agents::available" | jq
curl -s "http://localhost:3068/v2/city/accounts/agents:001:available" | jq
```

Expected: aggregate shows `USD/2: 100000` (10 × $100), and `agents:001` shows its `unit_price` metadata.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-genesis.ts
git commit -m "feat(scripts): genesis seeding of agents + platform + yield pool"
```

---

## Task 17: End-to-end smoke test

**Files:**
- Create: `packages/template-engine/test/e2e.test.ts`

Runs every template's `example.json` against the live local ledger after genesis seeding. This is the single test that proves the whole pipeline is real.

- [ ] **Step 1: Write `packages/template-engine/test/e2e.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { invoke, LedgerClient, loadTemplates } from "../src/index.js";

const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

const repoRoot = resolve(__dirname, "../../../");
const templatesRoot = resolve(repoRoot, "templates");

beforeAll(async () => {
  await fetch(`${url}/v2/${ledger}`, { method: "POST" });
  // Run genesis seeding once so balances exist
  execSync("pnpm seed-genesis", { cwd: repoRoot, stdio: "inherit" });
}, 60_000);

describe("E2E — every template runs with its example.json on a seeded ledger", () => {
  const client = new LedgerClient(url, ledger);

  it.each((async () => (await loadTemplates(templatesRoot)).map((t) => [t.id]))())(
    "%s",
    async (id: string) => {
      const all = await loadTemplates(templatesRoot);
      const t = all.find((x) => x.id === id)!;
      const r = await invoke({
        rootDir: templatesRoot, templateId: id, params: t.example as any,
        reference: `e2e:${id}:${Date.now()}`, client
      });
      expect(r.ok, JSON.stringify(r.error)).toBe(true);
      if (r.ok) expect(r.committed?.id).toBeTruthy();
    }
  );
});
```

- [ ] **Step 2: Reset ledger state for a clean e2e run**

```bash
pnpm ledger:down
pnpm ledger:up
```

- [ ] **Step 3: Run the e2e test**

```bash
cd packages/template-engine && pnpm test e2e
```

Expected: **13 tests pass.** Each template's example runs end-to-end on the live ledger with postings.

If a specific template fails — read the error phase:
- `load` → file missing / malformed JSON
- `validate` → example params don't match schema
- `dry-run` → Numscript syntax / runtime issue (rare since Task 15 caught it)
- `commit` → ledger rejects (e.g., `INSUFFICIENT_FUND` because previous tx already drained balance; adjust test ordering or re-seed between)

- [ ] **Step 4: Commit**

```bash
git add packages/template-engine/test/e2e.test.ts
git commit -m "test(e2e): all 13 templates run against a seeded local ledger"
```

---

## Task 18: Release-gate verification + README pass

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Verify release gates for Plan 1**

Run the full verification sequence. **Every command must succeed with the expected output.**

```bash
# Gate 1: Clean install works
pnpm ledger:down && rm -rf node_modules packages/*/node_modules && pnpm install

# Gate 2: Ledger boots, genesis seeds
pnpm ledger:up && pnpm seed-genesis

# Gate 3: All unit tests pass
pnpm test
# Expected: all vitest suites pass across template-engine package

# Gate 4: Playground API validation passes for all 13 templates
pnpm validate-templates
# Expected: "All 13 templates validated."

# Gate 5: E2E smoke — every example runs against the real ledger
cd packages/template-engine && pnpm test e2e
# Expected: 13 tests pass
cd ../..

# Gate 6: CLI works end-to-end
pnpm run-template p2p_transfer --example
# Expected: ✓ committed <tx-id>
```

If any gate fails — debug the specific failure before moving on. Do NOT mark the plan complete with a failing gate.

- [ ] **Step 2: Finalize `README.md`**

```markdown
# Numscript Agent City

An agent economy demo on Formance Ledger. Demonstrates that Numscript is a uniquely safe primitive for AI-agent-driven transactions.

See `docs/superpowers/specs/2026-04-21-numscript-agent-city-design.md` for the full design.

## What's in this foundations milestone

- **13 Numscript templates** (`/templates`) covering p2p, gig settlement, escrow, API metering, subscriptions, revenue splits, disputes, refunds, waterfall payments, bounded credit lines, and liquidations.
- **Template engine** (`/packages/template-engine`) — loads templates from disk, validates params against typed schemas, renders Numscript vars, dry-runs and commits via Formance.
- **CLI** (`/packages/cli`) — `pnpm run-template <id> --example` invokes any template end-to-end.
- **CI** — every commit validates all 13 templates against the Numscript Playground API.
- **Local dev** — Formance + Postgres via `docker-compose`; one-command bring-up.

## Quick start

    pnpm install
    cp .env.example .env
    pnpm ledger:up
    pnpm seed-genesis
    pnpm run-template p2p_transfer --example

## Template list

| id | purpose | feature |
|---|---|---|
| `p2p_transfer` | Direct agent-to-agent payment | source-bounded overdraft |
| `gig_settlement` | Winner + platform fee + reviewer fee | atomic allotment |
| `escrow_hold` | Lock funds for a pending job | idempotent `reference` |
| `escrow_release` | Release escrow to winner | `send [ASSET *]` sweep |
| `escrow_refund` | Return escrow to original payer | symmetric with release |
| `api_call_fee` | Metered per-call billing | `meta()` reads |
| `subscription_charge` | Period-keyed recurring charge | `reference` idempotency |
| `revenue_split` | Distribute pool to N recipients | `distribute()` + wildcards |
| `dispute_arbitration` | Atomic split between two parties | portion math |
| `refund` | Merchant → customer reversal | `reference` + typed caps |
| `waterfall_pay` | Pay from credits → earnings → main | cascading sources |
| `credit_line_charge` | Bounded overdraft credit line | `allowing overdraft up to` |
| `liquidate_wallet` | Drain balance (bankruptcy/role change) | `send [ASSET *]` |

## Not in this milestone

No agents, no front-end, no arena. Those ship in Plans 2–4 (see `docs/superpowers/plans/`).
```

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: README for foundations milestone; release gates verified"
```

---

## Release gates (recap)

Plan 1 is complete when all six gates pass cleanly:

1. **Clean install** — `pnpm install` from scratch succeeds
2. **Ledger boots + seeds** — `pnpm ledger:up && pnpm seed-genesis` succeeds
3. **Unit tests** — `pnpm test` green across template-engine
4. **Playground validation** — `pnpm validate-templates` green for all 13
5. **E2E smoke** — `pnpm test e2e` green for all 13 on a live ledger
6. **CLI round-trip** — `pnpm run-template p2p_transfer --example` commits a tx

## Self-review (done)

- ✅ **Spec coverage:** All templates (§ 4), account model (§ 5), template-engine architecture (§ 3), and dev stack (§ 9) implemented. Agents, front-end, arena explicitly deferred to Plans 2–4.
- ✅ **No placeholders:** Every step has real code or an exact command.
- ✅ **Type consistency:** `Template`, `TemplateSchema`, `ParamSpec`, `ParamValue`, `InvokeResult` are defined once in `types.ts` and used consistently in loader, validator, renderer, ledger-client, invoke, and tests. Function names stable across the plan (`loadTemplate`, `loadTemplates`, `validateParams`, `renderVars`, `LedgerClient.dryRun/commit`, `invoke`).
- ✅ **Dependency order:** Task 16 (seed) referenced by Task 17 (e2e); renderer/validator extended in Task 12c before templates that need them (revenue_split) are tested.

## Notes for future plans

- Plan 2 (Agent Runtime) can import `@nac/template-engine` directly — the `invoke()` interface is the agent's only ledger-touching call.
- Plan 2 will add a `Postgres` container to `docker-compose.yml` and a second package for the orchestrator.
- The `LedgerClient` will need a `getBalance(account)` method in Plan 2 for agent context — trivially added as another method on the same class.
- If the Formance v2 HTTP API's response shape differs in your version from what `ledger-client.ts` expects, fix it in one place (the unpack in `LedgerClient.post`) rather than scattering through call sites.

