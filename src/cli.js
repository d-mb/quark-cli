import * as env from "@env";
import * as sys from "@sys";
import * as sciter from "@sciter";

import { assembleProject } from "compiler.js";

function normalizePath(p) {
  return (p ?? "").toString().replaceAll("\\\\", "/");
}

function dirname(path) {
  const p = normalizePath(path);
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : ".";
}

function isAbsolutePath(path) {
  const p = normalizePath(path);
  // Windows: C:/..., or UNC //server/share
  if (/^[A-Za-z]:\//.test(p)) return true;
  if (p.startsWith("//")) return true;
  // Unix
  if (p.startsWith("/")) return true;
  return false;
}

function resolvePath(baseDir, maybeRelative) {
  const p = normalizePath(maybeRelative);
  if (!p) return p;
  if (isAbsolutePath(p)) return p;
  const b = normalizePath(baseDir) || ".";
  if (b.endsWith("/")) return b + p;
  return b + "/" + p;
}

function parseArgv(argv) {
  const args = [];
  for (const a of argv || []) args.push(String(a));

  // Heuristic: scapp may pass script/htm first; start parsing at first flag.
  const firstFlag = args.findIndex(a => a.startsWith("--"));
  const slice = firstFlag >= 0 ? args.slice(firstFlag) : args;

  const out = { _: [] };

  for (let i = 0; i < slice.length; i++) {
    const token = slice[i];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }

    const eq = token.indexOf("=");
    const key = (eq >= 0 ? token.slice(2, eq) : token.slice(2)).trim();
    const val = eq >= 0 ? token.slice(eq + 1) : (slice[i + 1] && !slice[i + 1].startsWith("--") ? slice[++i] : true);

    if (key === "target") {
      out.targets ??= [];
      out.targets.push(String(val));
    } else if (key === "targets") {
      out.targets = String(val).split(",").map(s => s.trim()).filter(Boolean);
    } else if (key === "silent") {
      out.silent = true;
    } else {
      out[key] = val;
    }
  }

  return out;
}

async function readTextFile(path) {
  // Prefer @storage when available (some Sciter builds provide higher-level helpers).
  // Fall back to @sys.fs for maximum compatibility.
  try {
    const storage = await import("@storage");
    const Storage = storage?.Storage;
    if (Storage?.open) {
      const s = Storage.open(path);
      if (s?.text) return s.text;
      if (s?.readText) return s.readText();
    }
  } catch {
    // ignore and fall back
  }

  const buffer = sys.fs.$readfile(path, "r");
  return sciter.decode(buffer, "utf-8");
}

async function loadProjectFromSettings(selector) {
  const settingsPath = env.path("USER_APPDATA", "sciter-js-quark.json");
  if (sys.fs.$stat(settingsPath) === null) return null;

  const json = await readTextFile(settingsPath);
  const data = JSON.parse(json);
  const projects = data?.projects || [];

  const sel = String(selector || "");
  return projects.find(p => p.id === sel || p.name === sel) || null;
}

function createVirtualConsoleLogger(silent = false) {
  const logEl = document.$("#log");
  const statusEl = document.$("#status");
  const progressEl = document.$("#progress");

  let shown = false;

  function ensureShown() {
    if (shown || silent) return;
    shown = true;
    Window.this.state = Window.WINDOW_SHOWN;
  }

  function append(text, type) {
    ensureShown();

    const chunk = String(text ?? "");
    const lines = chunk.replaceAll("\r\n", "\n").split("\n");
    for (const line of lines) {
      if (!line) continue;
      logEl.append(<text class={type}>{line}</text>);
    }
    logEl.lastElementChild?.scrollIntoView();
  }

  return {
    clear() {
      logEl.clear();
      progressEl.value = 0;
      statusEl.textContent = "";
    },
    add(text, type = "stdout") {
      append(text, type);
    },
    status(text, progressPct = null) {
      ensureShown();
      statusEl.textContent = String(text ?? "");
      if (typeof progressPct === "number") {
        progressEl.value = Math.max(0, Math.min(100, progressPct));
      }
    }
  };
}

function buildParamsFromFlags(flags, base = {}) {
  const params = Object.assign({}, base);

  if (flags.exe) params.exe = String(flags.exe);
  if (flags.resources) params.resources = normalizePath(flags.resources);
  if (flags.out) params.out = normalizePath(flags.out);
  if (flags.logo) params.logo = normalizePath(flags.logo);

  if (flags.productName) params.productName = String(flags.productName);
  if (flags.productVersion) params.productVersion = String(flags.productVersion);
  if (flags.productDescription) params.productDescription = String(flags.productDescription);
  if (flags.productCompany) params.productCompany = String(flags.productCompany);
  if (flags.productCopyright) params.productCopyright = String(flags.productCopyright);

  if (flags.targets) params.targets = flags.targets;

  return params;
}

document.ready = async function () {
  // Prefer Window.this.arguments (document args) but fall back to scapp argv.
  const rawArgv = (Window.this.arguments && Window.this.arguments.length) ? Window.this.arguments : (Window.this.scapp?.argv || []);
  const flags = parseArgv(rawArgv);
  const logger = createVirtualConsoleLogger(flags.silent);

  // Stay hidden until first log/status update.

  try {
    let base = null;

    if (flags.project) {
      base = await loadProjectFromSettings(flags.project);
      if (!base) {
        logger.add(`Project not found in settings: ${flags.project}`, "stderr");
        logger.status("Failed");
        document.post(() => Window.this.close());
        return;
      }
    }

    // Base dir for resolving relative paths:
    // - by default: folder containing cli.htm (stable)
    // - when --config is provided: folder containing that config file
    const cliDir = dirname(URL.toPath(document.url));

    if (flags.config) {
      const configPath = resolvePath(cliDir, flags.config);
      const json = await readTextFile(configPath);
      base = JSON.parse(json);

      // Resolve config-relative paths inside base project.
      const configDir = dirname(configPath);
      if (base?.resources) base.resources = resolvePath(configDir, base.resources);
      if (base?.out) base.out = resolvePath(configDir, base.out);
      if (base?.logo) base.logo = resolvePath(configDir, base.logo);
    }

    const params = buildParamsFromFlags(flags, base || {});

    // Resolve any remaining relative paths against cli.htm directory.
    if (params.resources) params.resources = resolvePath(cliDir, params.resources);
    if (params.out) params.out = resolvePath(cliDir, params.out);
    if (params.logo) params.logo = resolvePath(cliDir, params.logo);

    // Minimal validation for CLI.
    if (!params.exe || !params.resources || !params.out || !params.targets?.length) {
      logger.add("Usage:", "initial");
      logger.add("  scapp.exe cli.htm --project <id|name>", "initial");
      logger.add("  scapp.exe cli.htm --config <project.json>", "initial");
      logger.add("  scapp.exe cli.htm --exe app --resources path/to/app --out dist --logo icon.svg --targets winX64,mac [--silent]", "initial");
      logger.add("Required: --exe --resources --out --targets (unless --project/--config provides them)", "stderr");
      logger.status("Failed");
      document.post(() => Window.this.close());
      return;
    }

    logger.status("Starting build...", 0);

    const result = await assembleProject(params, { logger });

    if (result.ok) {
      logger.status("Success", 100);
      logger.add("Build succeeded.", "result");
    } else {
      logger.status("Failed", 100);
      logger.add(`Build failed (exitCode=${result.exitCode}).`, "stderr");
    }
  } catch (e) {
    logger.add(e?.message ? e.message : String(e), "stderr");
    logger.status("Failed", 100);
  } finally {
    if (flags.silent) {
        document.post(() => Window.this.close());
      }
  }
};
