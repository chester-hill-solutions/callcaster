import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Roadmap E3.1: tone text must read on the page in both themes. Values are
// read from the stylesheets, so a token edit that drops below AA fails here.
const vendorTheme = readFileSync("vendor/chester-hill-solutions/shad-cc/src/styles/theme.css", "utf8");
const appTheme = readFileSync("app/tailwind.css", "utf8");

type Rgb = [number, number, number];

function hslToRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function blend(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as Rgb;
}

/** Last definition wins, so app overrides of vendor tokens are honoured. */
function token(theme: "light" | "dark", name: string): Rgb {
  const selector = theme === "dark" ? /\.dark\s*\{([^}]*)\}/g : /(?::root|\.light)[^{]*\{([^}]*)\}/g;
  let value: string | null = null;
  for (const css of [vendorTheme, appTheme]) {
    for (const match of css.matchAll(selector)) {
      const m = new RegExp(`--${name}:\\s*hsl\\(([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\)`).exec(match[1] ?? "");
      if (m) value = `${m[1]} ${m[2]} ${m[3]}`;
    }
  }
  if (!value) throw new Error(`token --${name} not found for ${theme}`);
  const [h, s, l] = value.split(" ").map(Number) as [number, number, number];
  return hslToRgb(h, s, l);
}

const TONES = ["success", "warning", "info", "destructive"] as const;

describe.each(["light", "dark"] as const)("theme contrast — %s", (theme) => {
  const background = token(theme, "background");
  const card = token(theme, "card");

  test.each(TONES)("standalone text-%s-text clears AA on the page, on a card, and on its own 20% wash", (tone) => {
    const text = token(theme, `${tone}-text`);
    const wash = blend(token(theme, tone), 0.2, background);
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, wash)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(TONES)("a solid %s surface reads with its foreground", (tone) => {
    expect(contrast(token(theme, `${tone}-foreground`), token(theme, tone))).toBeGreaterThanOrEqual(4.5);
  });

  test("body text reads on the page and on a card", () => {
    const foreground = token(theme, "foreground");
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(foreground, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(theme, "muted-foreground"), background)).toBeGreaterThanOrEqual(4.5);
  });
});
