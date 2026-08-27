# Praxi SDK

Connect any website or app to Praxi. Two packages, one flow:

```
npm install @praxi/sdk
npx praxi connect
```

`praxi connect` scans the project (read-only: dependencies, config files,
schema files, env KEY NAMES, never values), shows what it found, asks, then
registers the project with the business's Praxi account, issues the browser
key, and writes the env vars. That is the whole setup.

## Packages

- `packages/sdk`, `@praxi/sdk`: the client library. Zero dependencies.
  - `@praxi/sdk` (server): holds the `sk_` secret key. Canonical events,
    typed entity upserts, actions, workflows.
  - `@praxi/sdk/browser` (browser): holds the `pk_` publishable key.
    Behavioral events only, enforced server-side. Batching, sendBeacon on
    page hide, optional page and form auto-tracking with credential-scrubbed
    fields.
- `packages/cli`, `praxi`: the `praxi connect` / `login` / `status` commands.
  Zero dependencies.

## Usage

Server:

```ts
import { Praxi } from "@praxi/sdk";
const praxi = new Praxi(); // reads PRAXI_SECRET_KEY

await praxi.event("order.created", {
  properties: { order: { external_id: "1001", total_minor: 4250, currency: "USD" } },
  customer: { email: "jo@example.com" },
  idempotencyKey: "order-1001",
});
await praxi.customer({ email: "jo@example.com", stage: "customer" });
await praxi.action("shopify", "recent_orders", { limit: 5 });
await praxi.workflow("welcome-sequence").trigger({ plan: "pro" });
```

Browser:

```ts
import { praxi } from "@praxi/sdk/browser";
praxi.init({
  publishableKey: process.env.NEXT_PUBLIC_PRAXI_KEY!,
  autoTrack: { pages: true, forms: true },
});
praxi.identify({ email });
praxi.track("product.viewed", { product_id: "p_1" });
```

## How it fits

Everything lands in the Praxi Universal Runtime (see
`Praxi-Api/docs/INTEGRATIONS.md`): canonical objects (Customer, Order,
Product, ...) and canonical events (`order.created`, `form.submitted`, ...),
the same shapes the Shopify connector and every future platform adapter
produce. Praxi OS (twin, automations, agents, CRM, analytics) sits on those
shapes and never needs to know which door the data came through.

Keys are minted per business, scoped, stored hashed, and revocable one at a
time from the dashboard. Publishable keys cannot write anything
money-shaped; that restriction is server-side, not a client-side courtesy.

## Development

```
npm install
npm run typecheck
npm test
npm run build
```
