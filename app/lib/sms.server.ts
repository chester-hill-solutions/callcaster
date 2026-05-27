const URL_REGEX = /https?:\/\/[^\s]+/g;

export function bodyHasUrls(text: string): boolean {
  return URL_REGEX.test(text);
}

/**
 * Remix chat/API paths rely on Twilio Link Shortening (`shortenUrls: true`)
 * when sending via a Messaging Service. Do not pre-shorten with third-party URLs.
 */
export async function processUrls(text: string): Promise<string> {
  return text;
}
