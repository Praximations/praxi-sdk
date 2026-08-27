import { DEFAULT_BASE_URL, PraxiError, request, type HttpOptions } from "./client.js";
import type {
  ActionResult,
  AppointmentInput,
  ConversationInput,
  CustomerInput,
  DocumentInput,
  EntitiesResult,
  EntityType,
  EventInput,
  FormSubmissionInput,
  Identity,
  IngestSummary,
  OrderInput,
  PaymentInput,
  ProductInput,
  SubscriptionInput,
} from "./types.js";

/**
 * The server-side Praxi client. Holds the SECRET key, so this class must
 * only ever be constructed server-side; the browser face lives in
 * "@praxi/sdk/browser" and physically cannot do what this one can.
 *
 *   import { Praxi } from "@praxi/sdk";
 *   const praxi = new Praxi();                  // reads PRAXI_SECRET_KEY
 *   await praxi.event("order.created", { properties: { order } });
 *   await praxi.customer({ email: "a@b.com", stage: "customer" });
 */

export interface PraxiOptions {
  /** Defaults to process.env.PRAXI_SECRET_KEY. */
  secretKey?: string;
  /** Defaults to process.env.PRAXI_API_URL, then the hosted API. */
  baseUrl?: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

interface EventOptions {
  properties?: Record<string, unknown>;
  customer?: CustomerInput;
  idempotencyKey?: string;
  occurredAt?: string;
}

const env = (name: string): string | undefined =>
  typeof process !== "undefined" ? process.env?.[name] : undefined;

export class Praxi {
  readonly #http: HttpOptions;

  constructor(options: PraxiOptions = {}) {
    const key = options.secretKey ?? env("PRAXI_SECRET_KEY") ?? "";
    if (!key) {
      throw new PraxiError(
        0,
        "missing_secret_key",
        "Set PRAXI_SECRET_KEY (npx praxi connect writes it) or pass { secretKey }."
      );
    }
    if (key.startsWith("pk_")) {
      throw new PraxiError(
        0,
        "publishable_key_on_server",
        "This is the browser key. The server client needs the sk_ secret key."
      );
    }
    this.#http = {
      baseUrl: options.baseUrl ?? env("PRAXI_API_URL") ?? DEFAULT_BASE_URL,
      key,
      ...(options.fetch ? { fetchImpl: options.fetch } : {}),
    };
  }

  /* -------------------------------- events -------------------------------- */

  /** Send one canonical event. Shorthand for events([...]). */
  event(name: string, options: EventOptions = {}): Promise<IngestSummary> {
    return this.events([
      {
        name,
        ...(options.properties ? { properties: options.properties } : {}),
        ...(options.customer ? { customer: options.customer } : {}),
        ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
        ...(options.occurredAt ? { occurred_at: options.occurredAt } : {}),
      },
    ]);
  }

  /** Send a batch of canonical events (up to 100). */
  events(events: EventInput[]): Promise<IngestSummary> {
    return request<IngestSummary>(this.#http, "POST", "/ingest/v1/events", { events });
  }

  /* ------------------------------- entities -------------------------------- */

  /** Upsert canonical objects directly (no event semantics). */
  entities(type: EntityType, records: Record<string, unknown>[]): Promise<EntitiesResult> {
    return request<EntitiesResult>(this.#http, "POST", `/ingest/v1/entities/${type}`, {
      records,
    });
  }

  async #one(type: EntityType, record: unknown): Promise<EntitiesResult> {
    const result = await this.entities(type, [record as Record<string, unknown>]);
    const failure = result.errors[0];
    if (failure) throw new PraxiError(400, "invalid_entity", failure.error);
    return result;
  }

  customer(input: CustomerInput): Promise<EntitiesResult> {
    return this.#one("customer", input);
  }
  product(input: ProductInput): Promise<EntitiesResult> {
    return this.#one("product", input);
  }
  order(input: OrderInput): Promise<EntitiesResult> {
    return this.#one("order", input);
  }
  payment(input: PaymentInput): Promise<EntitiesResult> {
    return this.#one("payment", input);
  }
  subscription(input: SubscriptionInput): Promise<EntitiesResult> {
    return this.#one("subscription", input);
  }
  appointment(input: AppointmentInput): Promise<EntitiesResult> {
    return this.#one("appointment", input);
  }
  conversation(input: ConversationInput): Promise<EntitiesResult> {
    return this.#one("conversation", input);
  }
  formSubmission(input: FormSubmissionInput): Promise<EntitiesResult> {
    return this.#one("form_submission", input);
  }
  document(input: DocumentInput): Promise<EntitiesResult> {
    return this.#one("document", input);
  }

  /* -------------------------------- actions -------------------------------- */

  /**
   * Ask Praxi to act through a connected platform. Lands in the business's
   * action log as a proposal; pass { execute: true } only when the key
   * carries the actions:execute scope.
   */
  action(
    provider: string,
    action: string,
    args: Record<string, unknown> = {},
    options: { execute?: boolean } = {}
  ): Promise<ActionResult> {
    return request<ActionResult>(this.#http, "POST", "/ingest/v1/actions", {
      provider,
      action,
      args,
      execute: options.execute ?? false,
    });
  }

  /* ------------------------------- workflows -------------------------------- */

  /**
   * Trigger a named Praxi workflow. Under the hood this is the
   * workflow.triggered canonical event, which automations subscribe to.
   */
  workflow(name: string): { trigger: (payload?: Record<string, unknown>) => Promise<IngestSummary> } {
    return {
      trigger: (payload = {}) =>
        this.event("workflow.triggered", { properties: { workflow: name, payload } }),
    };
  }

  /* ---------------------------------- ai ------------------------------------ */

  /** Ask Praxi a question grounded in this business. Not yet enabled server-side. */
  ai(prompt: string, options: Record<string, unknown> = {}): Promise<{ answer: string }> {
    return request<{ answer: string }>(this.#http, "POST", "/ingest/v1/ai", {
      prompt,
      ...options,
    });
  }

  /* --------------------------------- misc ----------------------------------- */

  /** Who am I: the business and scopes this key resolves to. */
  me(): Promise<Identity> {
    return request<Identity>(this.#http, "GET", "/ingest/v1/me");
  }
}
