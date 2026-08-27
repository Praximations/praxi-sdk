import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  captureFormFields,
  customerFromFields,
  randomId,
  shouldCaptureField,
} from "../src/browserCore.js";

/**
 * The rules that make form auto-capture shippable: credentials and card
 * data can never leave the page, whatever the site's markup calls them.
 */

describe("shouldCaptureField", () => {
  it("denies by input type", () => {
    expect(shouldCaptureField("anything", "password")).toBe(false);
    expect(shouldCaptureField("anything", "hidden")).toBe(false);
    expect(shouldCaptureField("anything", "file")).toBe(false);
    expect(shouldCaptureField("email", "email")).toBe(true);
  });

  it("denies by name pattern, case-insensitively", () => {
    for (const name of [
      "password",
      "Passwd",
      "card_number",
      "cc-cvv",
      "CVC",
      "ssn",
      "api_token",
      "one_time_pin",
      "accountNumber",
    ]) {
      expect(shouldCaptureField(name, "text"), name).toBe(false);
    }
    for (const name of ["email", "full_name", "message", "company", "phone"]) {
      expect(shouldCaptureField(name, "text"), name).toBe(true);
    }
  });

  it("denies unnamed fields", () => {
    expect(shouldCaptureField("", "text")).toBe(false);
  });
});

describe("captureFormFields", () => {
  it("keeps safe fields, drops dangerous ones, bounds values", () => {
    const fields = captureFormFields([
      { name: "email", type: "email", value: "a@b.com" },
      { name: "password", type: "password", value: "hunter2" },
      { name: "message", type: "textarea", value: "x".repeat(2000) },
      { name: "", type: "text", value: "anonymous" },
    ]);
    expect(Object.keys(fields)).toEqual(["email", "message"]);
    expect(fields.message!.length).toBe(500);
  });

  it("bounds the number of fields", () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      name: `field_${i}`,
      type: "text",
      value: "v",
    }));
    expect(Object.keys(captureFormFields(entries)).length).toBe(40);
  });
});

describe("customerFromFields", () => {
  it("finds an email-shaped value under an email-shaped name", () => {
    expect(
      customerFromFields({ e_mail: "a@b.com", full_name: "Ari W" })
    ).toEqual({ email: "a@b.com", name: "Ari W" });
  });

  it("returns nothing rather than guessing", () => {
    expect(customerFromFields({ email: "not-an-email" })).toBeUndefined();
    expect(customerFromFields({ message: "hi" })).toBeUndefined();
  });
});

describe("buildEnvelope", () => {
  it("carries ids, bounded context, and the identified customer", () => {
    const envelope = buildEnvelope(
      "page.viewed",
      { section: "pricing" },
      { anonymousId: "anon", sessionId: "sess" },
      { url: `https://x.com/${"y".repeat(3000)}`, title: "Pricing" },
      { email: "a@b.com" }
    );
    expect(envelope.name).toBe("page.viewed");
    expect(envelope.anonymous_id).toBe("anon");
    expect(envelope.session_id).toBe("sess");
    expect(envelope.customer).toEqual({ email: "a@b.com" });
    expect(envelope.context!.page_url!.length).toBe(2000);
    expect(envelope.properties).toEqual({ section: "pricing" });
  });
});

describe("randomId", () => {
  it("is 32 hex chars and unique", () => {
    const ids = new Set(Array.from({ length: 50 }, randomId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});
