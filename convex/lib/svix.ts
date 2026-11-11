// Verifies Clerk webhooks (delivered by Svix) with Web Crypto, no dependency.
//
// Scheme: signature = base64(HMAC_SHA256(base64decode(secret without "whsec_"),
// `${svix-id}.${svix-timestamp}.${rawBody}`)). The `svix-signature` header
// holds one or more space-separated `v1,<base64>` entries (key rotation).

const encoder = new TextEncoder();

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(buf: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Returns the raw body if the request is a valid, fresh Svix delivery. */
export async function verifySvix(
  request: Request,
  secret: string | undefined,
): Promise<{ ok: true; body: string } | { ok: false; status: number }> {
  if (!secret) return { ok: false, status: 500 };
  const id = request.headers.get("svix-id") ?? "";
  const ts = request.headers.get("svix-timestamp") ?? "";
  const sigs = request.headers.get("svix-signature") ?? "";
  if (!id || !/^\d{10}$/.test(ts) || !sigs) return { ok: false, status: 401 };
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return { ok: false, status: 401 };
  }

  const body = await request.text();
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      base64ToBytes(secret.replace(/^whsec_/, "")),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    return { ok: false, status: 500 }; // malformed secret
  }
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${id}.${ts}.${body}`),
  );
  const expected = bytesToBase64(mac);
  const valid = sigs
    .split(" ")
    .some((entry) => {
      const [version, sig] = entry.split(",");
      return version === "v1" && !!sig && safeEqual(sig, expected);
    });
  return valid ? { ok: true, body } : { ok: false, status: 401 };
}
