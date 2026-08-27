/**
 * The canonical Praxi shapes, the SDK's copy of the universal runtime's
 * vocabulary (Praxi-Api src/runtime/types.ts). The server validates
 * everything again with zod; these types exist so a TypeScript project gets
 * the contract at compile time without the SDK shipping a validator.
 */

export type CustomerStage = "lead" | "user" | "customer";

export interface CustomerInput {
  external_id?: string;
  email?: string;
  name?: string;
  phone?: string;
  stage?: CustomerStage;
  marketing_consent?: boolean;
  traits?: Record<string, unknown>;
}

export interface LineItem {
  external_product_id?: string;
  title?: string;
  quantity?: number;
  unit_price_minor?: number;
}

export type OrderStatus =
  | "pending"
  | "paid"
  | "fulfilled"
  | "canceled"
  | "refunded"
  | "partially_refunded";

export interface OrderInput {
  external_id: string;
  status?: OrderStatus;
  currency?: string;
  subtotal_minor?: number;
  discount_minor?: number;
  shipping_minor?: number;
  tax_minor?: number;
  /** Money is always integer minor units (cents), never floats. */
  total_minor: number;
  line_items?: LineItem[];
  placed_at?: string;
  customer?: CustomerInput;
  data?: Record<string, unknown>;
}

export interface ProductInput {
  external_id: string;
  title: string;
  description?: string;
  status?: "active" | "draft" | "archived";
  price_minor?: number;
  currency?: string;
  sku?: string;
  url?: string;
  image_url?: string;
  inventory_quantity?: number;
  data?: Record<string, unknown>;
}

export interface PaymentInput {
  external_id: string;
  status?: "pending" | "succeeded" | "failed" | "refunded";
  amount_minor: number;
  currency?: string;
  method?: string;
  occurred_at?: string;
  order_external_id?: string;
  customer?: CustomerInput;
  data?: Record<string, unknown>;
}

export interface SubscriptionInput {
  external_id: string;
  status?: "trialing" | "active" | "past_due" | "canceled" | "paused";
  plan_name?: string;
  amount_minor?: number;
  currency?: string;
  billing_interval?: "day" | "week" | "month" | "year";
  started_at?: string;
  current_period_end?: string;
  canceled_at?: string;
  customer?: CustomerInput;
  data?: Record<string, unknown>;
}

export interface AppointmentInput {
  external_id: string;
  status?: "requested" | "confirmed" | "completed" | "canceled" | "no_show";
  title?: string;
  starts_at?: string;
  ends_at?: string;
  location?: string;
  customer?: CustomerInput;
  data?: Record<string, unknown>;
}

export interface ConversationInput {
  external_id: string;
  channel?: "email" | "chat" | "sms" | "phone" | "social" | "other";
  subject?: string;
  status?: "open" | "closed";
  last_message_at?: string;
  customer?: CustomerInput;
  data?: Record<string, unknown>;
}

export interface FormSubmissionInput {
  external_id?: string;
  form_key?: string;
  form_name?: string;
  page_url?: string;
  fields?: Record<string, unknown>;
  submitted_at?: string;
  customer?: CustomerInput;
}

export interface DocumentInput {
  external_id: string;
  title: string;
  kind?: string;
  url?: string;
  mime_type?: string;
  customer?: CustomerInput;
  data?: Record<string, unknown>;
}

export type EntityType =
  | "customer"
  | "product"
  | "order"
  | "payment"
  | "subscription"
  | "appointment"
  | "conversation"
  | "form_submission"
  | "document";

export interface EventContext {
  page_url?: string;
  referrer?: string;
  title?: string;
  locale?: string;
  user_agent?: string;
}

export interface EventInput {
  /** Canonical dot notation ("order.created"), or "custom.*". */
  name: string;
  /** Same key twice = one event; set it when you might retry. */
  idempotency_key?: string;
  occurred_at?: string;
  customer?: CustomerInput;
  anonymous_id?: string;
  session_id?: string;
  properties?: Record<string, unknown>;
  context?: EventContext;
}

export interface IngestSummary {
  received: number;
  stored: number;
  deduped: number;
  applied: number;
  failed: number;
  automations_triggered: number;
}

export interface EntitiesResult {
  upserted: number;
  created: number;
  errors: { index: number; error: string }[];
}

export interface ActionResult {
  id: string;
  status: "proposed" | "executed" | "failed";
  result?: { ok: boolean; detail?: string };
  error?: string;
}

export interface Identity {
  business_id: string;
  business_name: string | null;
  key: {
    kind: "publishable" | "secret";
    environment: "live" | "test";
    scopes: string[];
    prefix: string;
  };
}
