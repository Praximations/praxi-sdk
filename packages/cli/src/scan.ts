import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * The project scanner behind `praxi connect`.
 *
 * READ-ONLY and shallow by design: package.json dependencies, well-known
 * config files, schema and migration files, and the KEY NAMES (never the
 * values) of .env files. Nothing here executes project code, and nothing
 * here leaves the machine until the developer has seen the report and
 * approved the connect call.
 */

export interface Detection {
  kind: string;
  name: string;
  detail?: string;
}

export interface ScanResult {
  framework?: string;
  frameworkName?: string;
  package_name?: string;
  detected: Detection[];
  /** The env var name the framework exposes to the browser bundle. */
  publicEnvVar: string;
}

/* ------------------------------ rule tables -------------------------------- */

/** dependency name -> what it means. First matching framework wins. */
const FRAMEWORKS: [dep: string, slug: string, name: string][] = [
  ["next", "nextjs", "Next.js"],
  ["@remix-run/react", "remix", "Remix"],
  ["astro", "astro", "Astro"],
  ["@sveltejs/kit", "sveltekit", "SvelteKit"],
  ["nuxt", "nuxt", "Nuxt"],
  ["express", "express", "Express"],
  ["fastify", "fastify", "Fastify"],
  ["hono", "hono", "Hono"],
  ["vite", "vite", "Vite"],
];

const DEP_RULES: [dep: string, kind: string, name: string][] = [
  ["@supabase/supabase-js", "database", "Supabase"],
  ["@prisma/client", "database", "Prisma"],
  ["prisma", "database", "Prisma"],
  ["drizzle-orm", "database", "Drizzle"],
  ["mongoose", "database", "MongoDB (Mongoose)"],
  ["pg", "database", "Postgres"],
  ["mysql2", "database", "MySQL"],
  ["next-auth", "auth", "NextAuth"],
  ["@clerk/nextjs", "auth", "Clerk"],
  ["@clerk/clerk-sdk-node", "auth", "Clerk"],
  ["@supabase/ssr", "auth", "Supabase Auth"],
  ["@supabase/auth-helpers-nextjs", "auth", "Supabase Auth"],
  ["lucia", "auth", "Lucia"],
  ["stripe", "payments", "Stripe"],
  ["@paddle/paddle-node-sdk", "payments", "Paddle"],
  ["square", "payments", "Square"],
  ["razorpay", "payments", "Razorpay"],
  ["resend", "email", "Resend"],
  ["@sendgrid/mail", "email", "SendGrid"],
  ["posthog-js", "analytics", "PostHog"],
  ["posthog-node", "analytics", "PostHog"],
  ["@vercel/analytics", "analytics", "Vercel Analytics"],
  ["plausible-tracker", "analytics", "Plausible"],
  ["react-ga4", "analytics", "Google Analytics"],
  ["react-hook-form", "forms", "React Hook Form"],
  ["formik", "forms", "Formik"],
  ["@calcom/embed-react", "booking", "Cal.com"],
];

/** Env KEY NAME patterns that reveal a service even without its SDK. */
const ENV_RULES: [pattern: RegExp, kind: string, name: string][] = [
  [/^STRIPE_/, "payments", "Stripe"],
  [/^PADDLE_/, "payments", "Paddle"],
  [/^PAYPAL_/, "payments", "PayPal"],
  [/SUPABASE/, "database", "Supabase"],
  [/^DATABASE_URL$/, "database", "SQL database"],
  [/^SENDGRID_/, "email", "SendGrid"],
  [/^RESEND_/, "email", "Resend"],
  [/^TWILIO_/, "communication", "Twilio"],
];

/** Table or model names that look like business objects Praxi understands. */
const DATA_SHAPE =
  /^(customers?|clients?|users?|members?|orders?|purchases?|products?|items?|subscriptions?|plans?|bookings?|appointments?|leads?|contacts?|invoices?|payments?)$/i;

const PUBLIC_ENV_VAR: Record<string, string> = {
  nextjs: "NEXT_PUBLIC_PRAXI_KEY",
  nuxt: "NUXT_PUBLIC_PRAXI_KEY",
  astro: "PUBLIC_PRAXI_KEY",
  sveltekit: "PUBLIC_PRAXI_KEY",
  vite: "VITE_PRAXI_KEY",
};

/* --------------------------------- helpers --------------------------------- */

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
}

async function readText(path: string): Promise<string | null> {
  return readFile(path, "utf8").catch(() => null);
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  const text = await readText(path);
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Walk a few source dirs for files, bounded so a monorepo can't stall us. */
async function sourceFiles(dir: string, cap: number): Promise<string[]> {
  const roots = ["app", "pages", "src", "components"];
  const extensions = new Set([".tsx", ".jsx", ".html", ".vue", ".svelte", ".astro"]);
  const found: string[] = [];

  async function walk(current: string, depth: number): Promise<void> {
    if (found.length >= cap || depth > 4) return;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (found.length >= cap) return;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (extensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) found.push(path);
    }
  }

  for (const root of roots) {
    if (await exists(join(dir, root))) await walk(join(dir, root), 0);
  }
  return found;
}

/* ---------------------------------- scan ----------------------------------- */

export async function scanProject(dir: string): Promise<ScanResult> {
  const detected: Detection[] = [];
  const seen = new Set<string>();
  const add = (d: Detection) => {
    const key = `${d.kind}:${d.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    detected.push(d);
  };

  const pkg = await readJson(join(dir, "package.json"));
  const deps: Record<string, string> = {
    ...((pkg?.dependencies as Record<string, string>) ?? {}),
    ...((pkg?.devDependencies as Record<string, string>) ?? {}),
  };

  /* framework */
  let framework: string | undefined;
  let frameworkName: string | undefined;
  for (const [dep, slug, name] of FRAMEWORKS) {
    if (deps[dep]) {
      framework = slug;
      frameworkName = name;
      add({ kind: "framework", name, detail: `dependency ${dep}` });
      break;
    }
  }

  /* dependency-declared services */
  for (const [dep, kind, name] of DEP_RULES) {
    if (deps[dep]) add({ kind, name, detail: `dependency ${dep}` });
  }

  /* env key names (never values) */
  for (const envFile of [".env", ".env.local", ".env.example", ".env.development"]) {
    const text = await readText(join(dir, envFile));
    if (!text) continue;
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
      if (!match) continue;
      const key = match[1]!;
      for (const [pattern, kind, name] of ENV_RULES) {
        if (pattern.test(key)) add({ kind, name, detail: `env var ${key} in ${envFile}` });
      }
    }
  }

  /* prisma models */
  const prismaSchema = await readText(join(dir, "prisma", "schema.prisma"));
  if (prismaSchema) {
    for (const match of prismaSchema.matchAll(/^\s*model\s+(\w+)\s*\{/gm)) {
      const model = match[1]!;
      if (DATA_SHAPE.test(model)) {
        add({ kind: "data", name: model, detail: "prisma model" });
      }
    }
  }

  /* supabase migrations */
  const migrationsDir = join(dir, "supabase", "migrations");
  if (await exists(migrationsDir)) {
    add({ kind: "database", name: "Supabase", detail: "supabase/ directory" });
    const files = (await readdir(migrationsDir).catch(() => [])).filter((f) =>
      f.endsWith(".sql")
    );
    for (const file of files.slice(0, 50)) {
      const sql = (await readText(join(migrationsDir, file))) ?? "";
      for (const match of sql.matchAll(/create table (?:if not exists )?"?(\w+)"?/gi)) {
        const table = match[1]!;
        if (DATA_SHAPE.test(table)) add({ kind: "data", name: table, detail: `table in ${file}` });
      }
    }
  }

  /* forms in markup */
  const files = await sourceFiles(dir, 300);
  let formFiles = 0;
  for (const file of files) {
    const text = await readText(file);
    if (text && /<form[\s>]/i.test(text)) formFiles += 1;
  }
  if (formFiles > 0) {
    add({
      kind: "forms",
      name: "HTML forms",
      detail: `${formFiles} file${formFiles === 1 ? "" : "s"} render a <form>`,
    });
  }

  return {
    ...(framework ? { framework, frameworkName } : {}),
    ...(typeof pkg?.name === "string" ? { package_name: pkg.name } : {}),
    detected,
    publicEnvVar: (framework && PUBLIC_ENV_VAR[framework]) || "PRAXI_PUBLISHABLE_KEY",
  };
}
