// HMAC-SHA256 request signing, shared by both signed hops (Convex -> n8n and
// n8n -> Convex). Uses Web Crypto, which the Convex runtime provides.
//
// Scheme: signature = hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))
// sent as `X-LendLoop-Signature: sha256=<hex>` next to
// `X-LendLoop-Timestamp: <unix seconds>`. Receivers must recompute over the
// RAW body, compare in constant time, and reject timestamps older than 5 min.

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function sign(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  return `sha256=${toHex(mac)}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type Verified =
  { ok: true; body: string } | { ok: false; status: number; reason: string };

/**
 * Verifies a signed request from n8n: shared token, timestamp within 5
 * minutes, and the HMAC over `${timestamp}.${rawBody}`. Every failure is a
 * generic 401 so callers learn nothing about which check failed.
 */
export async function verifyRequest(
  request: Request,
  secret: string | undefined,
  token: string | undefined,
): Promise<Verified> {
  if (!secret || !token) {
    return { ok: false, status: 500, reason: "not configured" };
  }
  const deny: Verified = { ok: false, status: 401, reason: "unauthorized" };
  const gotToken = request.headers.get("x-lendloop-token") ?? "";
  const ts = request.headers.get("x-lendloop-timestamp") ?? "";
  const gotSig = request.headers.get("x-lendloop-signature") ?? "";
  if (!safeEqual(gotToken, token)) return deny;
  if (!/^\d{10}$/.test(ts)) return deny;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return deny;
  const body = await request.text();
  if (!safeEqual(gotSig, await sign(secret, ts, body))) return deny;
  return { ok: true, body };
}
