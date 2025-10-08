// src/core/actions.ts
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execa } from "execa";

import type { EnvVarRequest } from "../services/env.js";
import {
  safeMergeEnvLocal,
  queueProviderSync,
  isVercelLinked,
} from "../services/env.js";
import { applyPatchText } from "../services/patchApply.js"; // supports *** Begin Patch format

export type ShellProviders = ("local" | "github" | "vercel" | "railway")[];
export type VercelScopes = ("development" | "preview" | "production")[];

/* ────────────────────────────────────────────────────────────────────────────
 * Action type definitions
 * ──────────────────────────────────────────────────────────────────────────── */

export type PatchAction = {
  type: "patch";
  diff: string; // unified diff OR LLM "*** Begin Patch" format
  description?: string;
};

export type ExecAction = {
  type: "exec";
  cmd: string;
  cwd?: string;
  description?: string;
};

export type CheckAction = {
  type: "check";
  description?: string;
  paths?: string[]; // optional: explicit roots to check
};

export type EnvRequestAction = {
  type: "env_request";
  variables?: {
    name: string;
    description?: string;
    requiredProviders?: ShellProviders;
    scopes?: VercelScopes;
    value?: string;
  }[];
  names?: string[]; // legacy
  providers?: ShellProviders; // legacy
  scopes?: VercelScopes; // legacy
};

export type ReadFileAction = {
  type: "read_file";
  path: string;
  description?: string;
};

export type WriteFileAction = {
  type: "write_file";
  path: string;
  content: string;
  description?: string;
};

export type EditFileAction = {
  type: "edit_file";
  path: string;
  oldContent: string;
  newContent: string;
  description?: string;
};

/** NEW: fast/deep repo scan */
export type RepoScanMode = "fast" | "deep";

export type ScanRepoAction = {
  type: "scan_repo";
  root?: string;           // defaults to process.cwd()
  mode?: RepoScanMode;     // "fast" (metadata only) | "deep" (includes SHA-1)
  respectIgnore?: boolean; // default true
};

export type Action =
  | PatchAction
  | ExecAction
  | CheckAction
  | EnvRequestAction
  | ReadFileAction
  | WriteFileAction
  | EditFileAction
  | ScanRepoAction;

export interface ExecuteResult {
  ok: boolean;
  errorLog?: string;
  data?: any; // for read_file or scan_repo results
}

export interface ExecutorCfg {
  shellAllowlist?: string[];
  actions?: { shell?: { allow?: string[] } };
  defaultCheck?: { runBuild?: boolean }; // if true, run `npm run build` when found
}

/* ────────────────────────────────────────────────────────────────────────────
 * Allowlist helpers
 * ──────────────────────────────────────────────────────────────────────────── */

function mergeAllowlist(cfg: ExecutorCfg): string[] {
  const a = Array.isArray(cfg?.actions?.shell?.allow) ? cfg.actions.shell.allow : [];
  const b = Array.isArray(cfg?.shellAllowlist) ? cfg.shellAllowlist : [];
  return Array.from(new Set([...a, ...b]));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Patch application
 * ──────────────────────────────────────────────────────────────────────────── */

async function applyUnifiedDiff(cwd: string, diff: string): Promise<void> {
  // If it's the LLM patch format, use our safe applier
  if (diff.includes("*** Begin Patch")) {
    await applyPatchText(diff, cwd);
    return;
  }

  // Otherwise, apply as a unified diff via git
  if (!fs.existsSync(path.join(cwd, ".git"))) {
    await execa("git init", { cwd, shell: true });
    await execa("git", ["checkout", "-B", "main"], { cwd });
  }

  try {
    await execa("git", ["apply", "--whitespace=nowarn", "-p0"], {
      cwd,
      input: diff,
      stdio: ["pipe", "inherit", "inherit"],
    });
  } catch (e: any) {
    const rejPath = path.join(cwd, ".af", "last.patch.rej.txt");
    fs.mkdirSync(path.dirname(rejPath), { recursive: true });
    fs.writeFileSync(rejPath, diff, "utf8");
    throw new Error(
      `git apply failed. Saved the diff to ${rejPath} for inspection.\n${e?.message || e}`
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * ENV request handling
 * ──────────────────────────────────────────────────────────────────────────── */

function normalizeEnvRequestPayload(a: EnvRequestAction): EnvVarRequest[] {
  let names: string[] = [];
  const providers: ShellProviders =
    (a.providers as ShellProviders) ?? ["local", "github", "vercel", "railway"];
  const scopes: VercelScopes =
    (a.scopes as VercelScopes) ?? ["development", "preview", "production"];

  if (Array.isArray(a.variables) && a.variables.length) {
    const rows = a.variables.map((v) => ({
      name: v.name,
      value: v.value,
      requiredProviders: (v.requiredProviders ?? providers) as ShellProviders,
      scopes: (v.scopes ?? scopes) as VercelScopes,
    }));
    return rows;
  }

  if (Array.isArray(a.names) && a.names.length) names = a.names;

  if (!names.length) throw new Error("env_request missing variables[] or names[]");
  return names.map((name) => ({ name, requiredProviders: providers, scopes }));
}

async function handleEnvRequest(
  payload: EnvRequestAction,
  cwd: string
): Promise<{ added: string[]; kept: string[]; vercelLinked: boolean }> {
  const variables = normalizeEnvRequestPayload(payload);
  const { added, kept } = safeMergeEnvLocal(cwd, variables);
  queueProviderSync(cwd, variables); // defer to deploy stage
  return { added, kept, vercelLinked: isVercelLinked(cwd) };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Default check
 * ──────────────────────────────────────────────────────────────────────────── */

async function runDefaultCheck(cwd: string, paths?: string[]): Promise<void> {
  const roots = (paths?.length ? paths : [cwd]).filter(Boolean);
  for (const root of roots) {
    const pkg = path.join(root, "package.json");
    if (fs.existsSync(pkg)) {
      const json = JSON.parse(fs.readFileSync(pkg, "utf8"));
      if (json?.scripts?.build) {
        await execa("npm run build", { cwd: root, stdio: "inherit", shell: true });
      }
    } else {
      const tsconfig = path.join(root, "tsconfig.json");
      if (fs.existsSync(tsconfig)) {
        await execa("tsc -p tsconfig.json", { cwd: root, stdio: "inherit", shell: true });
      }
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * NEW: Async, cancellable repo scanner with cache
 * ──────────────────────────────────────────────────────────────────────────── */

type CacheEntry = { size: number; mtimeMs: number; sha1?: string };
type CacheFile = { version: 1; entries: Record<string, CacheEntry> };

export type RepoFileInfo = {
  path: string;       // POSIX-like, relative to root
  size: number;
  mtimeMs: number;
  isBinary: boolean;
  sha1?: string;      // only in deep mode (or from cache)
};

export type RepoScanResult = {
  files: RepoFileInfo[];
  stats: { files: number; dirs: number; bytes: number };
  cachePath: string;
  mode: RepoScanMode;
};

const DEFAULT_IGNORE_DIRS = new Set<string>([
  ".git",
  ".af",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  ".cache",
  "tmp",
  "temp",
]);

/** Tiny helper: binary-ish if has NUL-byte in first chunk */
async function looksBinary(filePath: string): Promise<boolean> {
  try {
    const fh = await fsp.open(filePath, "r");
    const b = Buffer.allocUnsafe(1024);
    const { bytesRead } = await fh.read(b, 0, b.length, 0);
    await fh.close();
    for (let i = 0; i < bytesRead; i++) if (b[i] === 0) return true;
    return false;
  } catch {
    return false;
  }
}

function toPosix(p: string) {
  return p.split(path.sep).join("/");
}

function defaultIgnore(rel: string): boolean {
  const first = rel.split(/[\\/]/, 1)[0];
  return DEFAULT_IGNORE_DIRS.has(first);
}

async function sha1OfFile(abs: string): Promise<string> {
  const hash = createHash("sha1");
  const s = fs.createReadStream(abs);
  await new Promise<void>((resolve, reject) => {
    s.on("data", (d) => hash.update(d));
    s.on("error", reject);
    s.on("end", () => resolve());
  });
  return hash.digest("hex");
}

async function readCache(cachePath: string): Promise<CacheFile> {
  try {
    const text = await fsp.readFile(cachePath, "utf8");
    const json = JSON.parse(text);
    if (json && json.version === 1 && typeof json.entries === "object") {
      return json as CacheFile;
    }
  } catch {
    /* ignore */
  }
  return { version: 1, entries: {} };
}

async function writeCache(cachePath: string, cache: CacheFile) {
  await fsp.mkdir(path.dirname(cachePath), { recursive: true });
  await fsp.writeFile(cachePath, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

/**
 * Scan a repo quickly (fast) or deeply (compute SHA-1). Cancellable via AbortSignal.
 * Persists/uses a lightweight cache at .af/cache.json.
 */
export async function scanRepository(opts: {
  root?: string;
  mode?: RepoScanMode;
  signal?: AbortSignal;
  writeCache?: boolean; // default true
  respectIgnore?: boolean; // default true
  concurrency?: number; // default CPUs
} = {}): Promise<RepoScanResult> {
  const root = path.resolve(opts.root ?? process.cwd());
  const mode: RepoScanMode = opts.mode ?? "fast";
  const writeCacheFlag = opts.writeCache ?? true;
  const respectIgnore = opts.respectIgnore ?? true;
  const concurrency = Math.max(2, Math.min(os.cpus().length, opts.concurrency ?? os.cpus().length));
  const cachePath = path.join(root, ".af", "cache.json");

  const cache = await readCache(cachePath);
  const nextCache: CacheFile = { version: 1, entries: {} };

  let scannedFiles = 0;
  let scannedDirs = 0;
  let totalBytes = 0;

  let running = 0;
  const queue: (() => Promise<void>)[] = [];
  let resolveDrain!: () => void;
  let drained = new Promise<void>((r) => (resolveDrain = r));
  let doneEnqueue = false;

  function enqueue(fn: () => Promise<void>) {
    queue.push(fn);
    pump();
  }

  function pump() {
    while (running < concurrency && queue.length) {
      running++;
      queue.shift()!()
        .catch(() => { /* handled per-task */ })
        .finally(() => {
          running--;
          if (!queue.length && running === 0 && doneEnqueue) resolveDrain();
          else pump();
        });
    }
  }

  // progress ticker
  const started = Date.now();
  const tick = setInterval(() => {
    const secs = Math.max(1, Math.floor((Date.now() - started) / 1000));
    const rate = Math.floor(scannedFiles / secs);
    process.stdout.write(
      `\r⏳ Scanning (${mode}) — files: ${scannedFiles} dirs: ${scannedDirs} ~${rate}/s`
    );
  }, 250);

  // cancellation helper
  function throwIfAborted() {
    if (opts.signal?.aborted) throw new Error("Scan canceled");
  }
  opts.signal?.addEventListener("abort", () => {
    // ticking line break
    process.stdout.write("\n");
  });

  async function visitDir(dir: string, relDir = ""): Promise<void> {
    throwIfAborted();
    scannedDirs++;
    const it = await fsp.opendir(dir);
    for await (const entry of it) {
      throwIfAborted();
      const abs = path.join(dir, entry.name);
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (respectIgnore && defaultIgnore(rel)) continue;

      if (entry.isDirectory()) {
        enqueue(() => visitDir(abs, rel));
        continue;
      }
      if (!entry.isFile()) continue;

      enqueue(async () => {
        try {
          throwIfAborted();
          const st = await fsp.stat(abs);
          const relPosix = toPosix(rel);
          const prev = cache.entries[relPosix];
          const info: RepoFileInfo = {
            path: relPosix,
            size: st.size,
            mtimeMs: st.mtimeMs,
            isBinary: await looksBinary(abs),
          };
          totalBytes += st.size;

          if (mode === "deep") {
            if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs && prev.sha1) {
              info.sha1 = prev.sha1;
            } else {
              info.sha1 = await sha1OfFile(abs);
            }
          }

          nextCache.entries[relPosix] = {
            size: st.size,
            mtimeMs: st.mtimeMs,
            ...(info.sha1 ? { sha1: info.sha1 } : {}),
          };

          scannedFiles++;
        } catch {
          // swallow per-file errors; keep scanning
        }
      });
    }
  }

  try {
    await visitDir(root, "");
    doneEnqueue = true;
    if (!queue.length && running === 0) resolveDrain();
    await drained;
  } finally {
    clearInterval(tick);
    process.stdout.write("\n");
  }

  // remove stale cache entries (files that disappeared)
  for (const k of Object.keys(nextCache.entries)) {
    // already updated above
  }
  // Note: we only write entries we saw this run. That naturally removes stale ones.

  if (writeCacheFlag) await writeCache(cachePath, nextCache);

  return {
    files: Object.entries(nextCache.entries).map(([p, v]) => ({
      path: p,
      size: v.size,
      mtimeMs: v.mtimeMs,
      isBinary: false, // we don't persist this (cheap to recompute when needed)
      sha1: v.sha1,
    })),
    stats: { files: scannedFiles, dirs: scannedDirs, bytes: totalBytes },
    cachePath,
    mode,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Action executor
 * ──────────────────────────────────────────────────────────────────────────── */

export async function executeActions(
  cwd: string,
  cfg: ExecutorCfg,
  actions: Action[]
): Promise<ExecuteResult> {
  const allow = mergeAllowlist(cfg);
  const errors: string[] = [];
  const results: any[] = [];

  for (const a of actions) {
    try {
      switch (a.type) {
        case "patch": {
          if (!a.diff?.trim()) throw new Error("patch.diff is empty");
          console.log(a.description ? `✍️  ${a.description}` : "✍️  Applying patch");
          await applyUnifiedDiff(cwd, a.diff);
          break;
        }
        case "exec": {
          const bin = a.cmd.split(/\s+/)[0];
          if (allow.length && !allow.includes(bin)) {
            throw new Error(
              `Command '${bin}' is not in allowlist. Add it under .af/config.yml -> actions.shell.allow`
            );
          }
          console.log(`$ ${a.cmd}`);
          await execa(a.cmd, { stdio: "inherit", shell: true, cwd: a.cwd ?? cwd });
          break;
        }
        case "check": {
          console.log("🔎 Running checks…");
          await runDefaultCheck(cwd, a.paths);
          break;
        }
        case "env_request": {
          const res = await handleEnvRequest(a, cwd);
          console.log(
            `🔐 Env: added ${res.added.length}, kept ${res.kept.length}. Vercel linked: ${
              res.vercelLinked ? "yes" : "no"
            }`
          );
          break;
        }
        case "read_file": {
          const abs = path.isAbsolute(a.path) ? a.path : path.join(cwd, a.path);
          if (!abs.startsWith(cwd)) throw new Error("Read outside root blocked");
          console.log(`📖 Reading: ${a.path}`);
          const content = fs.readFileSync(abs, "utf-8");
          results.push({ action: "read_file", path: a.path, content });
          break;
        }
        case "write_file": {
          const abs = path.isAbsolute(a.path) ? a.path : path.join(cwd, a.path);
          if (!abs.startsWith(cwd)) throw new Error("Write outside root blocked");
          console.log(`📝 Writing: ${a.path}`);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, a.content, "utf-8");
          break;
        }
        case "edit_file": {
          const abs = path.isAbsolute(a.path) ? a.path : path.join(cwd, a.path);
          if (!abs.startsWith(cwd)) throw new Error("Edit outside root blocked");
          console.log(`✏️  Editing: ${a.path}`);
          const current = fs.readFileSync(abs, "utf-8");
          if (!current.includes(a.oldContent)) {
            throw new Error(`oldContent not found in ${a.path}`);
          }
          const updated = current.replace(a.oldContent, a.newContent);
          fs.writeFileSync(abs, updated, "utf-8");
          break;
        }
        case "scan_repo": {
          const ac = new AbortController();
          const onSigInt = () => ac.abort();
          process.once("SIGINT", onSigInt);
          try {
            const result = await scanRepository({
              root: a.root ?? cwd,
              mode: a.mode ?? "fast",
              signal: ac.signal,
              respectIgnore: a.respectIgnore ?? true,
            });
            results.push({ action: "scan_repo", result });
            console.log(
              `📦 Scanned ${result.stats.files} files, ${result.stats.dirs} dirs, ` +
              `${Math.round(result.stats.bytes / 1024)} KiB. Cache: ${result.cachePath}`
            );
          } finally {
            process.removeListener("SIGINT", onSigInt);
          }
          break;
        }
        default: {
          const _exhaustive: never = a as never;
          throw new Error(`Unknown action type: ${(a as any)?.type}`);
        }
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      errors.push(msg);
      console.error(`❌ Action failed: ${msg}`);
      return { ok: false, errorLog: errors.join("\n\n") };
    }
  }

  return { ok: true, data: results.length ? results : undefined };
}
