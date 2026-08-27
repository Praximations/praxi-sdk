#!/usr/bin/env node
import { resolve } from "node:path";
import { DEFAULT_BASE_URL, connectProject, me } from "./api.js";
import { appendEnvVars } from "./env.js";
import { ask, confirm } from "./prompt.js";
import { renderPlan, renderReport, renderSnippet } from "./report.js";
import { scanProject } from "./scan.js";
import { readCredentials, writeCredentials } from "./store.js";

/**
 * praxi, the CLI. The whole developer flow it exists for:
 *
 *   npm install @praxi/sdk
 *   npx praxi connect
 *
 * connect scans the project (read-only), SHOWS what it found, asks, and
 * only then registers the project and writes env vars. No config files, no
 * per-feature wiring, no questions the scan can answer itself.
 */

interface Flags {
  yes: boolean;
  dir: string;
  api?: string;
  label?: string;
}

function parseFlags(argv: string[]): { command: string; flags: Flags } {
  const flags: Flags = { yes: false, dir: process.cwd() };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--yes" || arg === "-y") flags.yes = true;
    else if (arg === "--dir") flags.dir = resolve(argv[++i] ?? ".");
    else if (arg === "--api") flags.api = argv[++i];
    else if (arg === "--label") flags.label = argv[++i];
    else rest.push(arg);
  }
  return { command: rest[0] ?? "help", flags };
}

async function resolveBaseUrl(flags: Flags): Promise<string> {
  if (flags.api) return flags.api;
  if (process.env.PRAXI_API_URL) return process.env.PRAXI_API_URL;
  const stored = await readCredentials();
  return stored?.baseUrl ?? DEFAULT_BASE_URL;
}

/** env > stored credentials > prompt. Returns the key and where it came from. */
async function resolveKey(): Promise<{ key: string; from: "env" | "stored" | "prompt" }> {
  if (process.env.PRAXI_SECRET_KEY) return { key: process.env.PRAXI_SECRET_KEY, from: "env" };
  const stored = await readCredentials();
  if (stored) return { key: stored.secretKey, from: "stored" };
  const key = await ask("Paste your Praxi secret key (sk_...): ");
  if (!key.startsWith("sk_")) {
    throw new Error("That does not look like a secret key. It starts with sk_.");
  }
  return { key, from: "prompt" };
}

/* -------------------------------- commands --------------------------------- */

async function login(flags: Flags): Promise<void> {
  const baseUrl = await resolveBaseUrl(flags);
  const key = await ask("Paste your Praxi secret key (sk_...): ");
  if (!key.startsWith("sk_")) {
    throw new Error("That does not look like a secret key. It starts with sk_.");
  }
  const identity = await me(baseUrl, key);
  const file = await writeCredentials({ secretKey: key, ...(flags.api ? { baseUrl } : {}) });
  console.log(`Logged in as "${identity.business_name ?? identity.business_id}".`);
  console.log(`Credentials saved to ${file}.`);
}

async function status(flags: Flags): Promise<void> {
  const baseUrl = await resolveBaseUrl(flags);
  const { key } = await resolveKey();
  const identity = await me(baseUrl, key);
  console.log(`Business: ${identity.business_name ?? identity.business_id}`);
  console.log(`Key:      ${identity.key.prefix}... (${identity.key.kind}, ${identity.key.environment})`);
  console.log(`Scopes:   ${identity.key.scopes.join(", ")}`);
  console.log(`API:      ${baseUrl}`);
}

async function connect(flags: Flags): Promise<void> {
  const baseUrl = await resolveBaseUrl(flags);
  const { key, from } = await resolveKey();

  const identity = await me(baseUrl, key);
  const businessName = identity.business_name ?? identity.business_id;
  console.log(`\nConnecting as "${businessName}".\n`);

  console.log("Scanning the project (read-only)...\n");
  const scan = await scanProject(flags.dir);
  console.log(renderReport(scan));
  console.log("");
  console.log(renderPlan(scan, businessName));
  console.log("");

  if (!(await confirm("Connect this project?", flags.yes))) {
    console.log("Nothing was connected.");
    return;
  }

  const result = await connectProject(baseUrl, key, scan, flags.label);
  console.log(`\nConnected. This project is now "${result.business.name}"'s SDK integration.`);

  const vars: Record<string, string> = {};
  if (from === "prompt") vars.PRAXI_SECRET_KEY = key;
  if (result.publishable_key) vars[scan.publicEnvVar] = result.publishable_key.token;

  if (result.publishable_key) {
    console.log(`Publishable key issued: ${result.publishable_key.prefix}...`);
  } else if (result.existing_publishable_prefix) {
    console.log(
      `The business already has a publishable key (${result.existing_publishable_prefix}...). ` +
        `Reuse it, or rotate it from the dashboard; tokens are only shown once at mint.`
    );
  }

  if (Object.keys(vars).length > 0) {
    const names = Object.keys(vars).join(", ");
    if (await confirm(`Write ${names} to .env.local?`, flags.yes)) {
      const { written, skipped } = await appendEnvVars(flags.dir, vars);
      if (written.length > 0) console.log(`Wrote ${written.join(", ")} to .env.local.`);
      if (skipped.length > 0) console.log(`Left ${skipped.join(", ")} alone (already set).`);
    }
  }

  console.log("");
  console.log(renderSnippet(scan));
  console.log("\nDone. Events will appear on the business's Praxi dashboard as they arrive.");
}

function help(): void {
  console.log(
    [
      "praxi, connect a website or app to Praxi",
      "",
      "  praxi connect   scan this project, show what was found, connect it",
      "  praxi login     store your secret key for future commands",
      "  praxi status    show which business and key this machine uses",
      "",
      "  flags: --yes  --dir <path>  --api <url>  --label <text>",
      "",
      "  The secret key is read from PRAXI_SECRET_KEY, then ~/.praxi/credentials.json.",
    ].join("\n")
  );
}

const { command, flags } = parseFlags(process.argv.slice(2));
const commands: Record<string, () => Promise<void> | void> = {
  connect: () => connect(flags),
  login: () => login(flags),
  status: () => status(flags),
  help,
};

try {
  await (commands[command] ?? help)();
} catch (e) {
  console.error(`praxi: ${(e as Error).message}`);
  process.exitCode = 1;
}
