import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { appendEnvVars } from "../src/env.js";
import { renderPlan, renderReport, renderSnippet } from "../src/report.js";
import { scanProject, type ScanResult } from "../src/scan.js";

/**
 * The scanner against two fixture projects, the exact experience behind
 * `praxi connect`: what a Next + Supabase + Stripe storefront and a
 * Prisma + Express API each look like in the report.
 */

const FIXTURES = join(__dirname, "fixtures");

function names(detected: { kind: string; name: string }[], kind: string): string[] {
  return detected.filter((d) => d.kind === kind).map((d) => d.name);
}

describe("next + supabase + stripe storefront", () => {
  let scan: ScanResult;
  beforeAll(async () => {
    scan = await scanProject(join(FIXTURES, "next-supabase-stripe"));
  });

  it("recognizes the framework and picks its public env var", () => {
    expect(scan.framework).toBe("nextjs");
    expect(scan.frameworkName).toBe("Next.js");
    expect(scan.publicEnvVar).toBe("NEXT_PUBLIC_PRAXI_KEY");
    expect(scan.package_name).toBe("acme-store");
  });

  it("finds the database, payments, and forms", () => {
    expect(names(scan.detected, "database")).toContain("Supabase");
    expect(names(scan.detected, "payments")).toContain("Stripe");
    expect(names(scan.detected, "forms")).toEqual(
      expect.arrayContaining(["React Hook Form", "HTML forms"])
    );
  });

  it("reads env KEY NAMES only, never values", () => {
    // Twilio has no SDK dependency in the fixture; only its env key name
    // reveals it, which is exactly what the env rules are for.
    const twilio = scan.detected.find((d) => d.name === "Twilio");
    expect(twilio?.detail).toContain("TWILIO_AUTH_TOKEN");
    expect(JSON.stringify(scan)).not.toContain("replace-me");
  });

  it("recognizes business-shaped tables and ignores the rest", () => {
    const data = names(scan.detected, "data");
    expect(data).toEqual(expect.arrayContaining(["customers", "orders"]));
    expect(data).not.toContain("widgets");
  });

  it("the report mentions what was found and what connecting does", () => {
    const report = renderReport(scan);
    expect(report).toContain("Next.js");
    expect(report).toContain("Stripe");
    const plan = renderPlan(scan, "Acme");
    expect(plan).toContain("Acme");
    expect(plan).toContain("NEXT_PUBLIC_PRAXI_KEY");
    expect(plan).toContain("revocable");
  });

  it("the snippet reads the right env var for the framework", () => {
    expect(renderSnippet(scan)).toContain("process.env.NEXT_PUBLIC_PRAXI_KEY");
  });
});

describe("prisma + express api", () => {
  let scan: ScanResult;
  beforeAll(async () => {
    scan = await scanProject(join(FIXTURES, "prisma-express"));
  });

  it("recognizes the framework with the generic public var", () => {
    expect(scan.framework).toBe("express");
    expect(scan.publicEnvVar).toBe("PRAXI_PUBLISHABLE_KEY");
  });

  it("reads prisma models as the data shape", () => {
    expect(names(scan.detected, "database")).toContain("Prisma");
    const data = names(scan.detected, "data");
    expect(data).toEqual(expect.arrayContaining(["Customer", "Order"]));
    expect(data).not.toContain("Widget");
  });
});

describe("appendEnvVars", () => {
  it("appends to .env.local and never overwrites an existing key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "praxi-env-"));
    await writeFile(join(dir, ".env"), "PRAXI_SECRET_KEY=already-here\n");

    const result = await appendEnvVars(dir, {
      PRAXI_SECRET_KEY: "sk_new",
      NEXT_PUBLIC_PRAXI_KEY: "pk_live_x",
    });
    expect(result.skipped).toEqual(["PRAXI_SECRET_KEY"]);
    expect(result.written).toEqual(["NEXT_PUBLIC_PRAXI_KEY"]);

    const local = await readFile(join(dir, ".env.local"), "utf8");
    expect(local).toContain("NEXT_PUBLIC_PRAXI_KEY=pk_live_x");
    expect(local).not.toContain("sk_new");
    // The untouched .env still has the original value.
    expect(await readFile(join(dir, ".env"), "utf8")).toContain("already-here");
  });
});
