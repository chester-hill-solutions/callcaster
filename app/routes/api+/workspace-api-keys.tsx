export { loader } from "./workspace-api-keys.loader.server";
export { action } from "./workspace-api-keys.action.server";

const KEY_SECRET_LENGTH = 32;
const KEY_PREFIX = "cc_live_";

function generateApiKey(
  hashApiKeyForStorage: (key: string) => string,
  apiKeyPrefixLength: number,
): { key: string; keyPrefix: string; keyHash: string } {
  const secret = randomBytes(KEY_SECRET_LENGTH).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  const keyPrefix = key.slice(0, apiKeyPrefixLength);
  const keyHash = hashApiKeyForStorage(key);
  return { key, keyPrefix, keyHash };
}

