import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
const DEFAULT_TOKEN_BYTES = 32;
/** Generate a URL-safe opaque token (base64url). Never store the raw value. */
export function generateOpaqueToken(byteLength = DEFAULT_TOKEN_BYTES) {
    return randomBytes(byteLength).toString("base64url");
}
/** SHA-256 hex digest of a token (including any app-side pepper prepended by the caller). */
export function hashOpaqueToken(token) {
    return createHash("sha256").update(token, "utf8").digest("hex");
}
/** Constant-time compare of a candidate token against a stored SHA-256 hex hash. */
export function verifyOpaqueToken(token, tokenHash) {
    const candidate = Buffer.from(hashOpaqueToken(token), "utf8");
    const stored = Buffer.from(tokenHash, "utf8");
    if (candidate.length !== stored.length) {
        return false;
    }
    return timingSafeEqual(candidate, stored);
}
