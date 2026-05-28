const URL_REGEX = /https?:\/\/[^\s]+/;

export function bodyHasUrls(text: string): boolean {
  return URL_REGEX.test(text);
}
