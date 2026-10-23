import { escapeHtml } from "@/lib/email-html";

/**
 * The one branded shell every transactional email is rendered from.
 *
 * Why this exists: each sender used to hand-roll its own HTML, so the same
 * product sent Arial on `#007bff` (bootstrap blue) in the reminder and a
 * different look in the invite. Nothing came from the design system, and the
 * plain-text alternative was written a second time by hand in every caller,
 * free to drift from the HTML it claimed to mirror.
 *
 * Constraints that shape the markup below:
 *  - Mail clients do not support CSS custom properties, so the design system's
 *    `--brand-primary` is pinned here as a literal, next to the token it
 *    mirrors. `hsl(357 75% 45%)`.
 *  - Web fonts frequently do not load, so the slab heading degrades to Georgia
 *    and the body to a system sans stack.
 *  - Layout is table-based and inline-styled; `<style>` blocks are stripped by
 *    several major clients.
 */

/** Mirrors `--brand-primary` from `@chester-hill-solutions/shad-cc`. */
const BRAND_PRIMARY = "#c91d25";
const INK = "#1f1f1f";
const MUTED = "#5c5c5c";
const BORDER = "#e4e4e7";
const SURFACE = "#fafafa";
const GOOD = "#15803d";
const WARN = "#b45309";

/** `--font-heading` with the fallbacks an email client can actually resolve. */
const FONT_HEADING = '"Zilla Slab", Georgia, "Times New Roman", serif';
const FONT_BODY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const PRODUCT_NAME = "CallCaster";
const SENDER_ADDRESS = "info@callcaster.ca";

export type BrandedEmailTone = "default" | "good" | "warn";

export type BrandedEmailFact = {
  label: string;
  value: string;
  tone?: BrandedEmailTone;
};

export type BrandedEmailInput = {
  /** The one line the reader should remember. */
  heading: string;
  /** A sentence or two of context under the heading. */
  intro?: string;
  /** Label/value rows, rendered as a definition table. */
  facts?: BrandedEmailFact[];
  /** An emphasised paragraph: the consequence, or the verdict. */
  note?: { text: string; tone?: BrandedEmailTone };
  cta?: { label: string; url: string };
  /**
   * A link for the footer. `label` names where it goes ("Notification
   * settings"); pass the workspace-scoped URL. Omitted for emails with no
   * workspace context, such as a password reset.
   */
  footerLink?: { label: string; url: string };
};

const TONE_COLOUR: Record<BrandedEmailTone, string> = {
  default: INK,
  good: GOOD,
  warn: WARN,
};

/**
 * The registered postal address, rendered in every footer.
 *
 * Hard-coded rather than configured: it is the sender's legal identity, the
 * same in every deployment, and not a secret. Transactional mail does not
 * require an unsubscribe, but it should say who is writing.
 */
const POSTAL_ADDRESS = "442 Pharmacy Ave, Toronto, ON M1L 3G6";

function footerAddress(): string {
  return POSTAL_ADDRESS;
}

/**
 * Render the branded HTML and its plain-text twin from ONE input, so the two
 * cannot describe different emails.
 */
export function renderBrandedEmail(input: BrandedEmailInput): {
  html: string;
  text: string;
} {
  return { html: renderHtml(input), text: renderText(input) };
}

function renderHtml(input: BrandedEmailInput): string {
  const facts = input.facts ?? [];
  const factsHtml =
    facts.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0;border-collapse:collapse;background:${SURFACE};border:1px solid ${BORDER};border-radius:8px;">
          ${facts
            .map(
              (fact, index) => `<tr>
            <td style="padding:12px 16px;${index > 0 ? `border-top:1px solid ${BORDER};` : ""}font-family:${FONT_BODY};font-size:14px;color:${MUTED};width:45%;">${escapeHtml(fact.label)}</td>
            <td style="padding:12px 16px;${index > 0 ? `border-top:1px solid ${BORDER};` : ""}font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${TONE_COLOUR[fact.tone ?? "default"]};text-align:right;">${escapeHtml(fact.value)}</td>
          </tr>`,
            )
            .join("")}
        </table>`
      : "";

  const noteHtml = input.note
    ? `<p style="margin:20px 0 0;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${TONE_COLOUR[input.note.tone ?? "default"]};font-weight:600;">${escapeHtml(input.note.text)}</p>`
    : "";

  const ctaHtml = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;"><tr>
        <td style="border-radius:6px;background:${BRAND_PRIMARY};">
          <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT_HEADING};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(input.cta.label)}</a>
        </td>
      </tr></table>`
    : "";

  const footerLinkHtml = input.footerLink
    ? `<br /><a href="${escapeHtml(input.footerLink.url)}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(input.footerLink.label)}</a>`
    : "";

  const footerIdentityHtml = `<br />${escapeHtml(footerAddress())}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${SURFACE};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
        <tr>
          <td style="height:4px;background:${BRAND_PRIMARY};line-height:4px;font-size:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:28px 28px 0;font-family:${FONT_HEADING};font-size:20px;font-weight:700;color:${BRAND_PRIMARY};">
            ${PRODUCT_NAME}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 28px;">
            <h1 style="margin:0;font-family:${FONT_HEADING};font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${escapeHtml(input.heading)}</h1>
            ${input.intro ? `<p style="margin:14px 0 0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(input.intro)}</p>` : ""}
            ${factsHtml}
            ${noteHtml}
            ${ctaHtml}
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">
        <tr>
          <td style="padding:18px 4px 0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${MUTED};">
            ${PRODUCT_NAME} · <a href="mailto:${SENDER_ADDRESS}" style="color:${MUTED};text-decoration:underline;">${SENDER_ADDRESS}</a>${footerIdentityHtml}${footerLinkHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function renderText(input: BrandedEmailInput): string {
  const lines: string[] = [PRODUCT_NAME, "", input.heading];
  if (input.intro) lines.push("", input.intro);
  const facts = input.facts ?? [];
  if (facts.length > 0) {
    lines.push("");
    for (const fact of facts) lines.push(`${fact.label}: ${fact.value}`);
  }
  if (input.note) lines.push("", input.note.text);
  if (input.cta) lines.push("", `${input.cta.label}: ${input.cta.url}`);
  lines.push("", `${PRODUCT_NAME} · ${SENDER_ADDRESS}`);
  lines.push(footerAddress());
  if (input.footerLink) lines.push(`${input.footerLink.label}: ${input.footerLink.url}`);
  return lines.join("\n");
}

/** Exposed for tests that assert the shell's brand facts. */
export const EMAIL_BRAND = {
  primary: BRAND_PRIMARY,
  fontHeading: FONT_HEADING,
  fontBody: FONT_BODY,
  senderAddress: SENDER_ADDRESS,
  productName: PRODUCT_NAME,
} as const;
