import { describe, expect, it } from "vitest";
import { Praxi } from "../src/server.js";
import { PraxiError } from "../src/client.js";

/**
 * The server client against a fake fetch: URL and header shape, body
 * shape, error mapping. The real HTTP contract is validated by the API's
 * own tests; this is the SDK's half of the handshake.
 */

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeApi(status: number, response: unknown) {
  const calls: Captured[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>)
      ),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(response), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const SUMMARY = {
  received: 1,
  stored: 1,
  deduped: 0,
  applied: 1,
  failed: 0,
  automations_triggered: 0,
};

function client(status: number, response: unknown) {
  const api = fakeApi(status, response);
  const praxi = new Praxi({
    secretKey: "sk_test_abcdefabcdefabcdefabcdefabcdefab",
    baseUrl: "https://api.example.com",
    fetch: api.fetchImpl,
  });
  return { praxi, calls: api.calls };
}

describe("construction", () => {
  it("refuses to run without a key, with a message that says what to do", () => {
    const previous = process.env.PRAXI_SECRET_KEY;
    delete process.env.PRAXI_SECRET_KEY;
    try {
      expect(() => new Praxi()).toThrowError(/PRAXI_SECRET_KEY|praxi connect/);
    } finally {
      if (previous !== undefined) process.env.PRAXI_SECRET_KEY = previous;
    }
  });

  it("refuses a publishable key: the server client is for secrets", () => {
    expect(() => new Praxi({ secretKey: "pk_live_abcdefabcdefabcdef" })).toThrowError(
      /publishable/
    );
  });
});

describe("events", () => {
  it("praxi.event posts one envelope to /ingest/v1/events with the bearer", async () => {
    const { praxi, calls } = client(202, SUMMARY);
    const summary = await praxi.event("order.created", {
      properties: { order: { external_id: "1", total_minor: 500 } },
      idempotencyKey: "order-1",
    });
    expect(summary).toEqual(SUMMARY);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.example.com/ingest/v1/events");
    expect(call.method).toBe("POST");
    expect(call.headers.authorization).toMatch(/^Bearer sk_test_/);
    expect(call.body).toEqual({
      events: [
        {
          name: "order.created",
          idempotency_key: "order-1",
          properties: { order: { external_id: "1", total_minor: 500 } },
        },
      ],
    });
  });
});

describe("entities", () => {
  it("typed helpers post one record to the right path", async () => {
    const { praxi, calls } = client(200, { upserted: 1, created: 1, errors: [] });
    await praxi.customer({ email: "a@b.com", stage: "customer" });
    expect(calls[0]!.url).toBe("https://api.example.com/ingest/v1/entities/customer");
    expect(calls[0]!.body).toEqual({ records: [{ email: "a@b.com", stage: "customer" }] });
  });

  it("a per-record failure surfaces as a thrown PraxiError", async () => {
    const { praxi } = client(200, {
      upserted: 0,
      created: 0,
      errors: [{ index: 0, error: "total_minor required" }],
    });
    await expect(praxi.order({ external_id: "1", total_minor: 1 })).rejects.toThrowError(
      PraxiError
    );
  });
});

describe("actions and workflows", () => {
  it("praxi.action proposes by default", async () => {
    const { praxi, calls } = client(202, { id: "a", status: "proposed" });
    const result = await praxi.action("shopify", "recent_orders", { limit: 5 });
    expect(result.status).toBe("proposed");
    expect(calls[0]!.body).toEqual({
      provider: "shopify",
      action: "recent_orders",
      args: { limit: 5 },
      execute: false,
    });
  });

  it("praxi.workflow triggers the canonical workflow event", async () => {
    const { praxi, calls } = client(202, SUMMARY);
    await praxi.workflow("welcome-sequence").trigger({ plan: "pro" });
    const body = calls[0]!.body as { events: { name: string; properties: unknown }[] };
    expect(body.events[0]!.name).toBe("workflow.triggered");
    expect(body.events[0]!.properties).toEqual({
      workflow: "welcome-sequence",
      payload: { plan: "pro" },
    });
  });
});

describe("errors", () => {
  it("maps the API's error shape onto PraxiError", async () => {
    const { praxi } = client(403, { error: "event_not_allowed", name: "order.created" });
    const failure = await praxi.event("order.created").catch((e) => e as PraxiError);
    expect(failure).toBeInstanceOf(PraxiError);
    expect((failure as PraxiError).status).toBe(403);
    expect((failure as PraxiError).code).toBe("event_not_allowed");
  });
});
