import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Token sealing for channel credentials (AES-256-GCM).
 *
 * The schema already says `sealedToken` is "stored sealed" and that it must never be
 * selected into a page payload — this is the module that makes that sentence true.
 * A channel token is a password to somebody's Instagram account: it is encrypted at
 * rest, authenticated (GCM), and bound to its tenant through the AAD so a ciphertext
 * copied from one row cannot be decrypted as another.
 *
 * Key: CHANNEL_TOKEN_ENC_KEY as 64 hex chars or base64 of 32 bytes.
 */
const VERSION = "v1";
const AAD_PREFIX = "radif:channel:";

export class SealError extends Error {}

function key(): Buffer {
  const raw = process.env.CHANNEL_TOKEN_ENC_KEY;
  if (!raw) throw new SealError("CHANNEL_TOKEN_ENC_KEY is not set");
  const trimmed = raw.trim();
  const fromHex = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : null;
  const fromBase64 = !fromHex ? Buffer.from(trimmed, "base64") : null;
  const candidate = fromHex ?? fromBase64;
  if (!candidate || candidate.length !== 32) {
    throw new SealError("CHANNEL_TOKEN_ENC_KEY must be 32 bytes (64 hex chars or base64)");
  }
  return candidate;
}

export function isSealConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url, bound to `tenantId`. */
export function sealToken(plaintext: string, tenantId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`${AAD_PREFIX}${tenantId}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function unsealToken(sealed: string, tenantId: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SealError("unrecognised sealed token format");
  const [, ivPart, tagPart, dataPart] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
  decipher.setAAD(Buffer.from(`${AAD_PREFIX}${tenantId}`, "utf8"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // A wrong key, a wrong tenant, or a tampered ciphertext all land here; the
    // distinction is not information the caller needs.
    throw new SealError("sealed token could not be opened");
  }
}

/** A stable fingerprint for logs and health checks — never the token itself. */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}
