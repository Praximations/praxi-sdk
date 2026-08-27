import type { ScanResult } from "./scan.js";

/**
 * The CLI's two API calls. Same /ingest surface the SDK uses, same secret
 * key, nothing bespoke.
 */

export const DEFAULT_BASE_URL = "https://praxi-api.vercel.app";

export interface Identity {
  business_id: string;
  business_name: string | null;
  key: { kind: string; environment: string; scopes: string[]; prefix: string };
}

export interface ConnectResponse {
  business: { id: string; name: string };
  connector: { provider: string; status: string };
  publishable_key: { token: string; prefix: string } | null;
  existing_publishable_prefix: string | null;
}

async function call<T>(baseUrl: string, key: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "That key was not accepted. Check it in the Praxi dashboard (it must be an sk_ secret key)."
        : `praxi api: ${parsed.error ?? `http ${res.status}`}`
    );
  }
  return parsed as T;
}

export function me(baseUrl: string, key: string): Promise<Identity> {
  return call<Identity>(baseUrl, key, "GET", "/ingest/v1/me");
}

export function connectProject(
  baseUrl: string,
  key: string,
  scan: ScanResult,
  label?: string
): Promise<ConnectResponse> {
  return call<ConnectResponse>(baseUrl, key, "POST", "/ingest/v1/connect", {
    project: {
      ...(scan.framework ? { framework: scan.framework } : {}),
      ...(scan.package_name ? { package_name: scan.package_name } : {}),
      detected: scan.detected.slice(0, 60),
    },
    mint_publishable: true,
    ...(label ? { label } : {}),
  });
}
