/**
 * The HTTP core both faces of the SDK share: one place that knows how to
 * talk to /ingest, how errors come back, and nothing else.
 */

export const DEFAULT_BASE_URL = "https://praxi-api.vercel.app";

export class PraxiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;

  constructor(status: number, code: string, detail?: unknown) {
    super(
      `praxi: ${code}${typeof detail === "string" ? `: ${detail}` : ""}${
        status > 0 ? ` (http ${status})` : ""
      }`
    );
    this.name = "PraxiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export interface HttpOptions {
  baseUrl: string;
  key: string;
  fetchImpl?: typeof fetch;
}

export async function request<T>(
  opts: HttpOptions,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${opts.key}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // A non-JSON body on an error status still throws below with its status.
  }

  if (!res.ok) {
    const record = (parsed ?? {}) as { error?: string; detail?: unknown };
    throw new PraxiError(res.status, record.error ?? "request_failed", record.detail);
  }
  return parsed as T;
}
