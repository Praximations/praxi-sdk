import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Writing env vars into the project, the only file `praxi connect` ever
 * touches, and only after asking. Appends to .env.local (creating it when
 * absent) and never overwrites a key that already exists in any local env
 * file: a developer's existing configuration always wins.
 */

const ENV_FILES = [".env", ".env.local", ".env.development"];

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8").catch(() => "");
}

export async function presentKeys(dir: string): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const file of ENV_FILES) {
    const text = await readText(join(dir, file));
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
      if (match) keys.add(match[1]!);
    }
  }
  return keys;
}

export async function appendEnvVars(
  dir: string,
  vars: Record<string, string>
): Promise<{ written: string[]; skipped: string[] }> {
  const existing = await presentKeys(dir);
  const written: string[] = [];
  const skipped: string[] = [];

  const lines: string[] = [];
  for (const [key, value] of Object.entries(vars)) {
    if (existing.has(key)) {
      skipped.push(key);
      continue;
    }
    lines.push(`${key}=${value}`);
    written.push(key);
  }
  if (lines.length === 0) return { written, skipped };

  const target = join(dir, ".env.local");
  const current = await readText(target);
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  await writeFile(target, `${current}${separator}\n# Added by praxi connect\n${lines.join("\n")}\n`);
  return { written, skipped };
}
