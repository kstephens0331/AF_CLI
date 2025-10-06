// src/services/nl2actions.ts
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

/** What the rest of the CLI passes in when planning from natural language */
export interface ChatToActionsInput {
  /** Absolute path to the working directory (project root) */
  cwd: string;
  /** The user’s freeform message (or prompt) that we turn into actions */
  message?: string;
  /** Optional: an already-formed prompt (fallback if message missing) */
  prompt?: string;

  // optional knobs (kept flexible so callers can pass what they have)
  session?: string;
  model?: string;
  system?: string;
  temperature?: number;
  autopilot?: boolean;
  extreme?: boolean;
}

/** A minimal “plan” shape: actions the executor can run plus an optional reply to show the user */
export type NLPlan = {
  actions: any[]; // executor handles discriminated unions; keep permissive here
  reply?: string;
};

// ---------------------
// Utilities
// ---------------------

function readText(fp: string): string | null {
  try {
    return fs.readFileSync(fp, "utf8");
  } catch {
    return null;
  }
}

function exists(fp: string): boolean {
  try {
    fs.accessSync(fp);
    return true;
  } catch {
    return false;
  }
}

function _readJson<T = any>(fp: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function writeSpecBack(cwd: string, spec: any) {
  const p = path.join(cwd, "product.spec.yml");
  try {
    fs.writeFileSync(p, yaml.dump(spec), "utf8");
  } catch {
    // best-effort
  }
}

function readSpec(cwd: string): any | null {
  const p = path.join(cwd, "product.spec.yml");
  if (!exists(p)) return null;
  try {
    return yaml.load(fs.readFileSync(p, "utf8")) ?? null;
  } catch {
    return null;
  }
}

function hasNextApp(cwd: string, frontendRoot?: string): boolean {
  const dir = frontendRoot && frontendRoot !== "." ? path.join(cwd, frontendRoot) : cwd;
  const pkgPath = path.join(dir, "package.json");
  if (!exists(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return Boolean(pkg.dependencies?.next || pkg.devDependencies?.next);
  } catch {
    return false;
  }
}

function detectPM(cwd: string): "pnpm" | "yarn" | "bun" | "npm" {
  if (exists(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (exists(path.join(cwd, "yarn.lock"))) return "yarn";
  if (exists(path.join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

function mkAddFile(rel: string, content: string): string {
  const body = content.replace(/\r\n/g, "\n").split("\n").map((l) => `+${l}`).join("\n");
  return [
    "*** Begin Patch",
    `*** Add File: ${rel}`,
    body.endsWith("+") ? body + "\n" : body,
    "*** End Patch",
  ].join("\n");
}

function _mkUpdateFile(rel: string, before: string, after: string): string {
  // minimal unified diff (true hunk). We’ll replace whole file content safely.
  const old = before.replace(/\r\n/g, "\n").split("\n");
  const neu = after.replace(/\r\n/g, "\n").split("\n");
  const header = [
    "*** Begin Patch",
    `*** Update File: ${rel}`,
    `@@`,
  ];
  const diffLines = [
    ...old.map((l) => `-${l}`),
    ...neu.map((l) => `+${l}`),
  ];
  return [...header, ...diffLines, "*** End Patch"].join("\n");
}

function _ensureArray<T>(x: T | T[] | undefined): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

// ---------------------
// Content generators
// ---------------------

function file_url_ts() {
  return `export function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}
export function absoluteUrl(path: string) {
  const base = getBaseUrl().replace(/\\/$/, "");
  const p = path.startsWith("/") ? path : \`/\${path}\`;
  return \`\${base}\${p}\`;
}
`;
}

function file_supabase_ts() {
  return `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE; // server-only

export function createAnonClient() {
  if (!supabaseUrl || !anonKey) throw new Error("Supabase envs missing");
  return createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
}

export function createServerClient() {
  if (!supabaseUrl || !serviceRole) throw new Error("Supabase service envs missing");
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
    global: { headers: { "X-Server-Env": "true" } },
  });
}
`;
}

function file_llm_ts() {
  return `export type LLMOpts = {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export async function generate(prompt: string, opts: LLMOpts = {}) {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = opts.model || process.env.TOGETHER_MODEL || "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo";
  if (!apiKey) throw new Error("TOGETHER_API_KEY missing");
  const res = await fetch("https://api.together.xyz/inference", {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${apiKey}\`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [{ role: "system", content: opts.system || "You are a helpful assistant for medical study content." },
              { role: "user", content: prompt }],
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
      stream: false
    })
  });
  if (!res.ok) throw new Error(\`Together API error \${res.status}\`);
  const data = await res.json();
  const text = data?.output_text || data?.output?.[0]?.content || JSON.stringify(data);
  return String(text);
}
`;
}

function file_srs_ts() {
  return `export type CardState = {
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  due_at: string; // ISO
};

export function nextReview(state: CardState, grade: 0|1|2|3|4|5, now = new Date()): CardState {
  let { interval_days, ease, reps, lapses } = state;
  // bounds
  ease = Math.max(1.3, Math.min(ease || 2.5, 2.8));
  if (grade < 3) {
    lapses += 1;
    reps = 0;
    interval_days = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (reps === 1) interval_days = 1;
    else if (reps === 2) interval_days = 6;
    else interval_days = Math.round(interval_days * ease);
    ease = Math.min(2.8, ease + (grade === 5 ? 0.05 : 0));
  }
  const due = new Date(now.getTime() + interval_days * 24 * 60 * 60 * 1000);
  return { interval_days, ease, reps, lapses, due_at: due.toISOString() };
}
`;
}

function file_prompts_ts() {
  return `export const mapPrompt = (chunk: string) => \`
You are building med lecture study notes.
CHUNK:
\${chunk}

Return JSON with { key_points: string[], pearls: string[], pitfalls: string[], tags: string[] }.
\`;

export const reducePrompt = (items: any[]) => \`
You are aggregating mapped items into a study pack.
Return JSON with { abstract, outline: string[], pearls: string[], cloze: string[], quiz: string[], vignettes: any[] }.
Items:
\${JSON.stringify(items).slice(0, 4000)}
\`;

export const reportPrompt = (pack: any) => \`
Make a coverage report (JSON) with { objectives: string[], timeline: string[], pitfalls: string[] } for this pack:
\${JSON.stringify(pack).slice(0, 4000)}
\`;

export const vignetteBatchPrompt = (context: string) => \`
Create 5 NBME-style vignettes (JSON list) from:
\${context}
\`;

export const directBatchPrompt = (context: string) => \`
Create 20 direct QA items (JSON list) from:
\${context}
\`;
`;
}

function api_stub(name: string, body: string = `return Response.json({ ok: true });`) {
  return `import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
${body.split("\n").map((l) => "    " + l).join("\n")}
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
`;
}

function sql_migration() {
  return `-- 0001_init.sql
create schema if not exists public;

-- Tables
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  transcript jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.lecture_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lecture_id uuid references public.lectures(id) on delete cascade,
  summary jsonb,
  report jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  outline jsonb,
  content text,
  created_at timestamp with time zone default now()
);

create table if not exists public.material_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  material_id uuid references public.materials(id) on delete cascade,
  items jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_kind text not null,
  source_id uuid,
  front text not null,
  back text not null,
  tags text[],
  interval_days int default 0,
  ease float default 2.5,
  reps int default 0,
  lapses int default 0,
  due_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_id uuid references public.cards(id) on delete cascade,
  grade int not null,
  reviewed_at timestamptz default now()
);

-- RLS
alter table public.blocks enable row level security;
alter table public.lectures enable row level security;
alter table public.lecture_packs enable row level security;
alter table public.materials enable row level security;
alter table public.material_packs enable row level security;
alter table public.cards enable row level security;
alter table public.reviews enable row level security;

create policy owner_blocks on public.blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_lectures on public.lectures for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_lecture_packs on public.lecture_packs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_materials on public.materials for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_material_packs on public.material_packs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_cards on public.cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_reviews on public.reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
`;
}

function sql_seed() {
  return `-- supabase/seed.sql
-- (Optional) example inserts (commented for safety)
-- insert into public.blocks (user_id, name, start_date, end_date)
-- values ('00000000-0000-0000-0000-000000000000','Example 8-week block', now()::date, (now() + interval '56 days')::date);
`;
}

function transcriber_pkg() {
  return `{
  "name": "transcriber",
  "private": true,
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  }
}
`;
}

function transcriber_index() {
  return `import express from "express";
import multer from "multer";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.post("/transcribe", upload.single("file"), async (req, res) => {
  // Mock transcription for now; can be replaced with Faster-Whisper later.
  const name = req.file?.originalname || "audio";
  res.json({
    ok: true,
    file: name,
    duration_sec: 300,
    segments: [
      { start: 0, end: 60, text: "Intro / objectives." },
      { start: 60, end: 180, text: "Core physiology." },
      { start: 180, end: 300, text: "Path and pearls." }
    ]
  });
});

const port = Number(process.env.PORT || 8081);
app.listen(port, () => console.log(\`Transcriber listening on :\${port}\`));
`;
}

function ingestor_pkg() {
  return `{
  "name": "ingestor",
  "private": true,
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  }
}
`;
}

function ingestor_index() {
  return `import express from "express";
import multer from "multer";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

async function extractPdf(buffer) {
  try {
    const { default: pdfParse } = await import("pdf-parse");
    const data = await pdfParse(buffer);
    return { kind: "pdf", outline: [], text: data.text || "" };
  } catch {
    return { kind: "pdf", outline: [], text: "" };
  }
}

app.post("/extract", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "file missing" });
  const mimetype = file.mimetype || "";
  let out = { kind: "unknown", outline: [], text: "" };

  if (mimetype.includes("pdf")) {
    out = await extractPdf(file.buffer);
  } else if (mimetype.includes("text") || file.originalname?.endsWith(".txt")) {
    out = { kind: "txt", outline: [], text: file.buffer.toString("utf8") };
  } else {
    out = { kind: "bin", outline: [], text: "" };
  }

  res.json({ ok: true, ...out });
});

const port = Number(process.env.PORT || 8082);
app.listen(port, () => console.log(\`Ingestor listening on :\${port}\`));
`;
}

function github_ci() {
  return `name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci || npm install
      - run: npm run typecheck --if-present
      - run: npm run build --if-present
`;
}

// ---------------------
// Planner
// ---------------------

export async function chatToActionsSmart(input: ChatToActionsInput): Promise<NLPlan> {
  const text = (input.message ?? input.prompt ?? "").trim();

  // Read/normalize spec
  const spec = readSpec(input.cwd) || {};
  const frontendRoot: string = spec.frontendRoot || ".";

  // Prepare patches (idempotent: only add new files)
  const root = frontendRoot === "." ? input.cwd : path.join(input.cwd, frontendRoot);
  const filesToAdd: Record<string, string> = {};

  // Ensure Next app exists; if not, we will not run create-next-app here to avoid conflicts.
  // Instead, we proceed to add app/api & src/lib scaffolding. If Next is truly missing,
  // the build step will fail with a clear error.
  const appDir = path.join(root, "app");
  if (!exists(appDir)) {
    // Create the folder structure via patch (Next app assumed from scaffold/earlier runs).
    // We won't add all Next boilerplate; just ensure api files land under app/.
  }

  // src/lib helpers
  if (!exists(path.join(root, "src", "lib"))) {
    // directories are created by the patch executor automatically
  }
  if (!exists(path.join(root, "src", "lib", "url.ts"))) {
    filesToAdd[path.posix.join(frontendRoot, "src/lib/url.ts")] = file_url_ts();
  }
  if (!exists(path.join(root, "src", "lib", "supabase.ts"))) {
    filesToAdd[path.posix.join(frontendRoot, "src/lib/supabase.ts")] = file_supabase_ts();
  }
  if (!exists(path.join(root, "src", "lib", "llm.ts"))) {
    filesToAdd[path.posix.join(frontendRoot, "src/lib/llm.ts")] = file_llm_ts();
  }
  if (!exists(path.join(root, "src", "lib", "srs.ts"))) {
    filesToAdd[path.posix.join(frontendRoot, "src/lib/srs.ts")] = file_srs_ts();
  }
  if (!exists(path.join(root, "src", "lib", "prompts.ts"))) {
    filesToAdd[path.posix.join(frontendRoot, "src/lib/prompts.ts")] = file_prompts_ts();
  }

  // API routes (minimal stubs; compile and return {ok:true})
  const apiRoutes = [
    "blocks/current",
    "lecture/upload",
    "lecture/summarize",
    "lecture/report",
    "vignettes/batch",
    "directqs/batch",
    "material/upload",
    "material/generate",
    "srs/bootstrap",
    "srs/next",
    "srs/review",
    "coach/next",
    "coach/answer",
  ];
  for (const r of apiRoutes) {
    const rel = path.posix.join(frontendRoot, "app/api", r, "route.ts");
    const fp = path.join(root, "app", "api", r, "route.ts");
    if (!exists(fp)) filesToAdd[rel] = api_stub(r);
  }

  // Supabase migrations/seed
  const migDir = path.join(input.cwd, "supabase", "migrations");
  if (!exists(migDir)) {
    filesToAdd["supabase/migrations/0001_init.sql"] = sql_migration();
  }
  if (!exists(path.join(input.cwd, "supabase", "seed.sql"))) {
    filesToAdd["supabase/seed.sql"] = sql_seed();
  }

  // Services (Railway)
  const transDir = path.join(input.cwd, "services", "transcriber");
  if (!exists(transDir)) {
    filesToAdd["services/transcriber/package.json"] = transcriber_pkg();
    filesToAdd["services/transcriber/index.js"] = transcriber_index();
  }
  const ingDir = path.join(input.cwd, "services", "ingestor");
  if (!exists(ingDir)) {
    filesToAdd["services/ingestor/package.json"] = ingestor_pkg();
    filesToAdd["services/ingestor/index.js"] = ingestor_index();
  }

  // CI
  const ghCi = path.join(input.cwd, ".github", "workflows", "ci.yml");
  if (!exists(ghCi)) {
    filesToAdd[".github/workflows/ci.yml"] = github_ci();
  }

  // product.spec.yml: bake in frontendRoot if we’re not at "."
  if (!spec.frontendRoot) {
    spec.frontendRoot = ".";
    writeSpecBack(input.cwd, spec);
  }

  // Build env_request (queued only; no provider sync here)
  const envReq = {
    type: "env_request",
    variables: [
      { name: "NEXT_PUBLIC_SUPABASE_URL", requiredProviders: ["local","github","vercel","railway"], scopes: ["development","preview","production"] },
      { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", requiredProviders: ["local","github","vercel","railway"], scopes: ["development","preview","production"] },
      { name: "SUPABASE_SERVICE_ROLE", requiredProviders: ["local","github","vercel","railway"], scopes: ["development","preview","production"] },
      { name: "TOGETHER_API_KEY", requiredProviders: ["local","github","vercel","railway"], scopes: ["development","preview","production"] },
      { name: "TOGETHER_MODEL", requiredProviders: ["local","github","vercel","railway"], scopes: ["development","preview","production"] },
      { name: "TRANSCRIBE_URL", requiredProviders: ["local","github","vercel","railway"], scopes: ["development","preview","production"] },
      { name: "INGESTOR_URL", requiredProviders: ["local","github","vercel","railway"], scopes: ["development","preview","production"] },
      { name: "NEXT_PUBLIC_BASE_URL", requiredProviders: ["local","github","vercel","railway"], scopes: ["development","preview","production"] },
    ],
  };

  // Package manager + install commands
  const pm = detectPM(root);
  const pkgManagerCmd = (args: string) => {
    if (pm === "pnpm") return `pnpm ${args}`;
    if (pm === "yarn") return `yarn ${args}`;
    if (pm === "bun") return `bun ${args}`;
    return `npm ${args}`;
  };

  const dep = ["@supabase/supabase-js", "zod", "date-fns", "uuid", "@tailwindcss/typography", "clsx"];
  const devDep = ["typescript", "@types/node", "@types/react", "eslint", "prettier", "eslint-config-next"];
  const svcDep = ["express", "multer", "busboy", "form-data", "undici", "zod"];
  const ingestorExtra = ["pdf-parse"];

  const actions: any[] = [];

  // 1) Patch files (single patch containing all adds for idempotence)
  const files = Object.entries(filesToAdd);
  if (files.length) {
    const diff = files.map(([rel, content]) => mkAddFile(rel, content)).join("\n");
    actions.push({ type: "patch", diff, description: "Scaffold app/api routes, lib helpers, services, CI, and Supabase SQL" });
  }

  // 2) Env collection (queues to .env.local and .af/pending-env-sync.json; no provider pushes yet)
  actions.push(envReq);

  // 3) Install deps in Next app
  if (hasNextApp(root, ".")) {
    actions.push({ type: "exec", cmd: pkgManagerCmd(`install ${dep.join(" ")}`), cwd: root, description: "Install runtime deps" });
    actions.push({ type: "exec", cmd: pkgManagerCmd(`install -D ${devDep.join(" ")}`), cwd: root, description: "Install dev deps" });
  }

  // 4) Install service deps
  if (!exists(path.join(transDir, "node_modules"))) {
    actions.push({ type: "exec", cmd: pkgManagerCmd(`install ${svcDep.join(" ")}`), cwd: path.join(input.cwd, "services", "transcriber"), description: "Install transcriber deps" });
  }
  if (!exists(path.join(ingDir, "node_modules"))) {
    actions.push({ type: "exec", cmd: pkgManagerCmd(`install ${[...svcDep, ...ingestorExtra].join(" ")}`), cwd: path.join(input.cwd, "services", "ingestor"), description: "Install ingestor deps" });
  }

  // 5) Typecheck/build (best-effort)
  if (hasNextApp(root, ".")) {
    actions.push({ type: "exec", cmd: pkgManagerCmd("run build"), cwd: root, description: "Build Next app" });
  }

  // 6) Git init + first commit (idempotent)
  if (!exists(path.join(input.cwd, ".git"))) {
    actions.push({ type: "exec", cmd: "git init -b main", cwd: input.cwd, description: "Init git" });
  }
  actions.push({ type: "exec", cmd: "git add .", cwd: input.cwd, description: "Stage changes" });
  actions.push({ type: "exec", cmd: `git commit -m "chore: scaffold Med Study Partner app/api, services, SQL, CI" || echo "no changes"`, cwd: input.cwd, description: "Commit" });

  // 7) Create remote if missing (GitHub CLI already authenticated per your init)
  const gitConfig = readText(path.join(input.cwd, ".git", "config")) || "";
  if (!/github\.com/.test(gitConfig)) {
    const repoName = path.basename(input.cwd).replace(/[^a-zA-Z0-9._-]/g, "-");
    actions.push({ type: "exec", cmd: `gh repo create ${repoName} --source=. --private --push --disable-issues=false --disable-wiki=false`, cwd: input.cwd, description: "Create GitHub repo & push" });
  } else {
    actions.push({ type: "exec", cmd: "git push -u origin main || true", cwd: input.cwd, description: "Push main" });
  }

  // 8) Post-build check
  actions.push({
    type: "check",
    description: "Verify key files exist & env placeholders present",
  });

  const reply =
    "Planned full build: scaffold files, collect envs (local only), install deps, build, and commit/push. No provider env sync or Vercel link until you trigger deploy.";

  return { actions, reply };
}
