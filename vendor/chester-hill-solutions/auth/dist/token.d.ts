/** Generate a URL-safe opaque token (base64url). Never store the raw value. */
export declare function generateOpaqueToken(byteLength?: number): string;
/** SHA-256 hex digest of a token (including any app-side pepper prepended by the caller). */
export declare function hashOpaqueToken(token: string): string;
/** Constant-time compare of a candidate token against a stored SHA-256 hex hash. */
export declare function verifyOpaqueToken(token: string, tokenHash: string): boolean;
