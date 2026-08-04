/** Merge Better Auth Set-Cookie headers into a loader/action response Headers bag. */
export function mergeBetterAuthSetCookieHeaders(
  source: Headers | undefined,
  target: Headers = new Headers(),
): Headers {
  if (!source) {
    return target;
  }

  source.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      target.append("Set-Cookie", value);
    }
  });

  return target;
}
