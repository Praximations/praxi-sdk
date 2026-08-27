/**
 * @praxi/sdk, the server entry point.
 *
 *   import { Praxi } from "@praxi/sdk";          // server, secret key
 *   import { praxi } from "@praxi/sdk/browser";  // browser, publishable key
 */
export { Praxi, type PraxiOptions } from "./server.js";
export { PraxiError, DEFAULT_BASE_URL } from "./client.js";
export type * from "./types.js";
