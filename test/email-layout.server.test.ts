import { describe, expect, test } from "vitest";

import {
  EMAIL_BRAND,
  renderBrandedEmail,
} from "../app/lib/email-layout.server";

/** Every inline style attribute value, as a reader of the HTML would see it. */
function styleAttributes(html: string): string[] {
  return [...html.matchAll(/style="([^"]*)"/g)].map((match) => match[1] ?? "");
}

const fullInput = {
  heading: "Reset your password",
  intro:
    "We received a request to reset the password for your CallCaster account.",
  facts: [{ label: "Workspace", value: "North End", tone: "good" as const }],
  note: {
    text: "If you didn't request this, you can safely ignore this email.",
  },
  cta: {
    label: "Reset password",
    url: "https://app.callcaster.ca/reset?token=t",
  },
  footerLink: {
    label: "Notification settings",
    url: "https://app.callcaster.ca/settings",
  },
};

describe("renderBrandedEmail (the one shell every transactional email uses)", () => {
  // #2943: the font stacks carried double-quoted family names ("Zilla Slab",
  // "Segoe UI") and were interpolated into double-quoted style attributes, so
  // each attribute ended at the first inner quote and every rule after it was
  // dropped. The reset email's button rendered as a bare underlined link on the
  // red pill, and the intro, facts and footer lost their type entirely.
  test("leaves no inline style attribute truncated by a quote inside it", () => {
    const { html } = renderBrandedEmail(fullInput);
    const styles = styleAttributes(html);

    expect(styles.length).toBeGreaterThan(10);
    // Every rule in the shell ends with its terminating semicolon. A truncated
    // attribute ends mid-declaration instead, which is the tell.
    for (const style of styles) {
      expect(style.endsWith(";")).toBe(true);
    }
    expect(html).toContain("font-family:'Zilla Slab'");
    expect(html).not.toContain('font-family:"');
  });

  test("keeps the button's own colour and decoration so clients cannot restyle it", () => {
    const { html } = renderBrandedEmail(fullInput);
    const button = styleAttributes(html).find((style) =>
      style.includes("padding:12px 24px"),
    );

    expect(button).toBeDefined();
    expect(button).toContain("color:#ffffff");
    expect(button).toContain("text-decoration:none");
    // The pill behind the label, not the anchor, carries the brand colour.
    expect(html).toContain(`background:${EMAIL_BRAND.primary}`);
  });

  test("states the sender's postal address in both twins", () => {
    // Kept on purpose (#2943): the address is the sender's legal identity, and
    // transactional mail says who is writing even though it needs no unsubscribe.
    const { html, text } = renderBrandedEmail(fullInput);
    const address = "442 Pharmacy Ave, Toronto, ON M1L 3G6";

    expect(html).toContain(address);
    expect(text).toContain(address);
    expect(text).toContain(EMAIL_BRAND.senderAddress);
  });

  test("renders the plain-text twin from the same input as the HTML", () => {
    const { text } = renderBrandedEmail(fullInput);

    expect(text).toContain(fullInput.heading);
    expect(text).toContain(fullInput.intro);
    expect(text).toContain("Workspace: North End");
    expect(text).toContain(fullInput.note.text);
    expect(text).toContain(`Reset password: ${fullInput.cta.url}`);
  });
});
