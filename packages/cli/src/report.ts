import type { ScanResult } from "./scan.js";

/**
 * How the scan is shown to the developer. The report is the consent
 * surface: it must say exactly what was found and exactly what connecting
 * will do, before anything leaves the machine.
 */

const KIND_LABELS: Record<string, string> = {
  framework: "Framework",
  database: "Database",
  auth: "Authentication",
  payments: "Payments",
  email: "Email",
  analytics: "Analytics",
  forms: "Forms",
  booking: "Booking",
  communication: "Communication",
  data: "Data model",
};

const KIND_ORDER = [
  "framework",
  "database",
  "auth",
  "payments",
  "data",
  "forms",
  "booking",
  "email",
  "analytics",
  "communication",
];

export function renderReport(scan: ScanResult): string {
  const lines: string[] = [];
  lines.push("What Praxi found in this project:");
  lines.push("");

  const byKind = new Map<string, { name: string; detail?: string }[]>();
  for (const d of scan.detected) {
    const list = byKind.get(d.kind) ?? [];
    list.push(d);
    byKind.set(d.kind, list);
  }

  if (scan.detected.length === 0) {
    lines.push("  Nothing recognized yet. Praxi can still connect: events and");
    lines.push("  customers flow in as your code sends them.");
  }

  const kinds = [...byKind.keys()].sort(
    (a, b) => (KIND_ORDER.indexOf(a) + 99) - (KIND_ORDER.indexOf(b) + 99)
  );
  for (const kind of kinds) {
    lines.push(`  ${KIND_LABELS[kind] ?? kind}`);
    for (const d of byKind.get(kind)!) {
      lines.push(`    - ${d.name}${d.detail ? `  (${d.detail})` : ""}`);
    }
  }
  return lines.join("\n");
}

export function renderPlan(scan: ScanResult, businessName: string): string {
  const lines: string[] = [];
  lines.push(`Connecting will do the following for "${businessName}":`);
  lines.push("");
  lines.push("  1. Register this project as the business's SDK integration");
  lines.push("     (the scan summary above is stored with it; no code, no env");
  lines.push("     values, and no data leave this machine).");
  lines.push("  2. Issue a publishable browser key if the business has none.");
  lines.push(`  3. Offer to write ${scan.publicEnvVar} (and your secret key,`);
  lines.push("     if it is not already in your env) to .env.local.");
  lines.push("");
  lines.push("  Praxi receives only what your code sends it afterwards, and");
  lines.push("  every key is revocable from the Praxi dashboard.");
  return lines.join("\n");
}

/** The copy-paste snippet for the detected framework. */
export function renderSnippet(scan: ScanResult): string {
  const publicVar = scan.publicEnvVar;
  const browserRead =
    scan.framework === "nextjs"
      ? `process.env.${publicVar}`
      : scan.framework === "vite" || scan.framework === "sveltekit" || scan.framework === "astro"
        ? `import.meta.env.${publicVar}`
        : `process.env.${publicVar}`;

  return [
    "Add Praxi to your app:",
    "",
    "  // browser (put this in your root layout or entry)",
    '  import { praxi } from "@praxi/sdk/browser";',
    `  praxi.init({ publishableKey: ${browserRead}!, autoTrack: { pages: true, forms: true } });`,
    "",
    "  // server (anywhere you handle real business events)",
    '  import { Praxi } from "@praxi/sdk";',
    "  const praxi = new Praxi(); // reads PRAXI_SECRET_KEY",
    '  await praxi.event("order.created", { properties: { order } });',
  ].join("\n");
}
