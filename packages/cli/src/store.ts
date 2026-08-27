import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where `praxi login` keeps the developer's credentials: one JSON file in
 * the home directory, never inside a project (a project directory gets
 * committed; a home directory does not).
 */

const DIR = join(homedir(), ".praxi");
const FILE = join(DIR, "credentials.json");

export interface StoredCredentials {
  secretKey: string;
  baseUrl?: string;
}

export async function readCredentials(): Promise<StoredCredentials | null> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as StoredCredentials;
    return typeof parsed.secretKey === "string" && parsed.secretKey ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeCredentials(credentials: StoredCredentials): Promise<string> {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  return FILE;
}
