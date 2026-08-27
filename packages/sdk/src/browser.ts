import { DEFAULT_BASE_URL } from "./client.js";
import {
  buildEnvelope,
  captureFormFields,
  customerFromFields,
  randomId,
} from "./browserCore.js";
import type { CustomerInput, EventInput } from "./types.js";

/**
 * The browser face of Praxi. Publishable key only, and the server enforces
 * that such a key can send BEHAVIORAL events and nothing else, so this file
 * can be shipped to any visitor without trusting any visitor.
 *
 *   import { praxi } from "@praxi/sdk/browser";
 *   praxi.init({ publishableKey: "pk_live_...", autoTrack: { pages: true, forms: true } });
 *   praxi.identify({ email });
 *   praxi.track("product.viewed", { product_id: "p_1" });
 *
 * Events queue and flush in batches (2s or 20 events), with sendBeacon on
 * pagehide so the tail of a session is not lost to navigation.
 */

export interface PraxiBrowserOptions {
  publishableKey: string;
  baseUrl?: string;
  autoTrack?: {
    /** page.viewed on load and on history navigation. */
    pages?: boolean;
    /** form.submitted with credential-scrubbed fields. */
    forms?: boolean;
  };
}

const FLUSH_MS = 2000;
const MAX_QUEUE = 20;
const ANON_STORAGE_KEY = "praxi_anonymous_id";
const SESSION_STORAGE_KEY = "praxi_session_id";

interface State {
  key: string;
  endpoint: string;
  anonymousId: string;
  sessionId: string;
  queue: EventInput[];
  timer: ReturnType<typeof setTimeout> | null;
  identified: CustomerInput | null;
}

let state: State | null = null;

/** Storage can throw (private windows, blocked site data); never let it. */
function stored(storage: () => Storage, key: string, make: () => string): string {
  try {
    const existing = storage().getItem(key);
    if (existing) return existing;
    const fresh = make();
    storage().setItem(key, fresh);
    return fresh;
  } catch {
    return make();
  }
}

function pageInfo() {
  return {
    url: location.href,
    referrer: document.referrer || undefined,
    title: document.title || undefined,
    locale: navigator.language || undefined,
  };
}

function send(events: EventInput[], useBeacon: boolean): void {
  if (!state || events.length === 0) return;
  const body = JSON.stringify({ events });
  const url = `${state.endpoint}/ingest/v1/events`;

  // sendBeacon cannot carry an Authorization header, so the pagehide path
  // rides the key in the query string; the server accepts either. A
  // publishable key in a URL is fine, it is already in the page source.
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon(
      `${url}?key=${encodeURIComponent(state.key)}`,
      new Blob([body], { type: "application/json" })
    );
    return;
  }

  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${state.key}` },
    body,
    keepalive: true,
  }).catch(() => {
    // Analytics must never break the page; a lost batch is a lost batch.
  });
}

function flush(useBeacon = false): void {
  if (!state || state.queue.length === 0) return;
  const events = state.queue.splice(0, state.queue.length);
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  send(events, useBeacon);
}

function enqueue(event: EventInput): void {
  if (!state) return;
  state.queue.push(event);
  if (state.queue.length >= MAX_QUEUE) {
    flush();
    return;
  }
  if (!state.timer) {
    state.timer = setTimeout(() => flush(), FLUSH_MS);
  }
}

function track(name: string, properties: Record<string, unknown> = {}): void {
  if (!state) return;
  enqueue(
    buildEnvelope(
      name,
      properties,
      { anonymousId: state.anonymousId, sessionId: state.sessionId },
      pageInfo(),
      state.identified ?? undefined
    )
  );
}

function autoTrackPages(): void {
  track("page.viewed");
  const emit = () => track("page.viewed");
  const wrap = (method: "pushState" | "replaceState") => {
    const original = history[method].bind(history);
    history[method] = ((...args: Parameters<History["pushState"]>) => {
      original(...args);
      emit();
    }) as History["pushState"];
  };
  wrap("pushState");
  wrap("replaceState");
  addEventListener("popstate", emit);
}

function autoTrackForms(): void {
  addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const entries = [...form.elements]
        .filter(
          (el): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLSelectElement
        )
        .map((el) => ({
          name: el.name,
          type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
          value: el.value,
        }));
      const fields = captureFormFields(entries);
      if (Object.keys(fields).length === 0) return;
      const customer = customerFromFields(fields);
      if (customer && state) state.identified = state.identified ?? customer;
      track("form.submitted", {
        form_key: form.id || form.name || undefined,
        fields,
      });
    },
    // Capture phase: run even when the page's own handler stops propagation.
    true
  );
}

export const praxi = {
  init(options: PraxiBrowserOptions): void {
    if (typeof window === "undefined") return;
    if (state) return;
    if (!options.publishableKey.startsWith("pk_")) {
      console.error("praxi: init() takes the publishable pk_ key, never the secret key.");
      return;
    }
    state = {
      key: options.publishableKey,
      endpoint: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
      anonymousId: stored(() => localStorage, ANON_STORAGE_KEY, randomId),
      sessionId: stored(() => sessionStorage, SESSION_STORAGE_KEY, randomId),
      queue: [],
      timer: null,
      identified: null,
    };
    addEventListener("pagehide", () => flush(true));
    track("session.started");
    if (options.autoTrack?.pages) autoTrackPages();
    if (options.autoTrack?.forms) autoTrackForms();
  },

  /** Say who this visitor is; rides on every later event too. */
  identify(customer: CustomerInput): void {
    if (!state) return;
    state.identified = customer;
    track("customer.identified");
  },

  track,

  page(properties: Record<string, unknown> = {}): void {
    track("page.viewed", properties);
  },

  flush(): void {
    flush();
  },
};
