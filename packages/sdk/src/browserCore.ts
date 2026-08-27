import type { CustomerInput, EventContext, EventInput } from "./types.js";

/**
 * The pure half of the browser client: envelope building, form-field
 * capture rules, id generation. No DOM access, so all of it is unit
 * testable, and browser.ts stays a thin wiring layer.
 */

/** Ids are random, unguessable enough for analytics identity, not security. */
export function randomId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Which form fields auto-capture may keep. Deny beats allow: anything that
 * smells like a credential or a card number never leaves the page, whatever
 * the site's markup calls it.
 */
const DENY_TYPES = new Set(["password", "hidden", "file"]);
// \bpan\b, not bare "pan": "company" must stay capturable while a literal
// PAN field is not. Underscore counts as a word char, but card_pan is
// already denied by "card".
const DENY_NAME =
  /pass|pwd|card|cvv|cvc|ccv|\bpan\b|iban|routing|account.?number|ssn|social|secret|token|otp|pin/i;
const MAX_FIELD_CHARS = 500;
const MAX_FIELDS = 40;

export function shouldCaptureField(name: string, type: string): boolean {
  if (!name) return false;
  if (DENY_TYPES.has(type.toLowerCase())) return false;
  return !DENY_NAME.test(name);
}

/** Filter + bound raw (name, type, value) triples into a fields record. */
export function captureFormFields(
  entries: { name: string; type: string; value: string }[]
): Record<string, string> {
  const fields: Record<string, string> = {};
  let kept = 0;
  for (const entry of entries) {
    if (kept >= MAX_FIELDS) break;
    if (!shouldCaptureField(entry.name, entry.type)) continue;
    const value = entry.value.slice(0, MAX_FIELD_CHARS);
    if (!value) continue;
    fields[entry.name] = value;
    kept += 1;
  }
  return fields;
}

/** Pull a customer reference out of captured fields when one is present. */
export function customerFromFields(fields: Record<string, string>): CustomerInput | undefined {
  const email = Object.entries(fields).find(
    ([name, value]) => /e.?mail/i.test(name) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  )?.[1];
  if (!email) return undefined;
  const name = Object.entries(fields).find(
    ([field, value]) => /^(full.?)?name$/i.test(field) && value.length > 1
  )?.[1];
  return { email, ...(name ? { name } : {}) };
}

export interface PageInfo {
  url?: string;
  referrer?: string;
  title?: string;
  locale?: string;
}

export function buildEnvelope(
  name: string,
  properties: Record<string, unknown>,
  ids: { anonymousId: string; sessionId: string },
  page: PageInfo,
  customer?: CustomerInput
): EventInput {
  const context: EventContext = {
    ...(page.url ? { page_url: page.url.slice(0, 2000) } : {}),
    ...(page.referrer ? { referrer: page.referrer.slice(0, 2000) } : {}),
    ...(page.title ? { title: page.title.slice(0, 300) } : {}),
    ...(page.locale ? { locale: page.locale.slice(0, 35) } : {}),
  };
  return {
    name,
    occurred_at: new Date().toISOString(),
    anonymous_id: ids.anonymousId,
    session_id: ids.sessionId,
    properties,
    context,
    ...(customer ? { customer } : {}),
  };
}
