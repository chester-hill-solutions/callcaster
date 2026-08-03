import { describe, expect, test } from "vitest";

import { getSafeRedirectPath } from "@/lib/safe-redirect";

describe("getSafeRedirectPath", () => {
  test("keeps an ordinary same-origin path", () => {
    expect(getSafeRedirectPath("/workspaces/abc/campaigns")).toBe(
      "/workspaces/abc/campaigns",
    );
    expect(getSafeRedirectPath("/a?b=c#d")).toBe("/a?b=c#d");
  });

  test("rejects absolute URLs", () => {
    expect(getSafeRedirectPath("https://evil.example")).toBe("/");
    expect(getSafeRedirectPath("http://evil.example/x")).toBe("/");
  });

  /**
   * The one that slipped past sign-in and 2FA: it starts with "/", so a naive
   * `startsWith("/")` accepts it, and the browser reads it as another origin.
   * The response carries freshly-set session cookies, which is what makes this
   * worse than an ordinary open redirect.
   */
  test("rejects protocol-relative URLs", () => {
    expect(getSafeRedirectPath("//evil.example")).toBe("/");
    expect(getSafeRedirectPath("//evil.example/path")).toBe("/");
  });

  test("rejects the backslash variant some browsers fold to //", () => {
    expect(getSafeRedirectPath("/\\evil.example")).toBe("/");
  });

  test("treats missing input as the fallback", () => {
    expect(getSafeRedirectPath(null)).toBe("/");
    expect(getSafeRedirectPath(undefined)).toBe("/");
    expect(getSafeRedirectPath("")).toBe("/");
  });

  test("honours a caller-supplied fallback", () => {
    expect(getSafeRedirectPath(null, { fallback: "/workspaces" })).toBe("/workspaces");
    expect(getSafeRedirectPath("//evil.example", { fallback: "/workspaces" })).toBe(
      "/workspaces",
    );
  });

  test("blocks configured prefixes so a redirect cannot loop", () => {
    expect(
      getSafeRedirectPath("/signin", {
        fallback: "/workspaces",
        disallowPrefixes: ["/signin"],
      }),
    ).toBe("/workspaces");
  });
});
