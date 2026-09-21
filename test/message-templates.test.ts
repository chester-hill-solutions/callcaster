import { describe, expect, test } from "vitest";

import {
  hasTemplateSyntax,
  processTemplateTags,
  SAMPLE_TEMPLATE_CONTACT,
} from "@/lib/message-templates";

const contact = SAMPLE_TEMPLATE_CONTACT;

describe("message-templates brace contract (#1725)", () => {
  test("replaces balanced double-brace and legacy single-brace tags", () => {
    expect(processTemplateTags("Hi {{firstname}}!", contact)).toBe("Hi Jordan!");
    expect(processTemplateTags("Hi {firstname}!", contact)).toBe("Hi Jordan!");
    expect(processTemplateTags("{{ firstname }}", contact)).toBe("Jordan");
  });

  test("leaves unbalanced braces literal", () => {
    expect(processTemplateTags("Hi {{firstname}!", contact)).toBe("Hi {{firstname}!");
    expect(processTemplateTags("Hi {firstname}}!", contact)).toBe("Hi {firstname}}!");
  });

  test("keeps fallbacks for both brace forms", () => {
    expect(processTemplateTags('{{unknown|"there"}}', contact)).toBe("there");
    expect(processTemplateTags("{unknown|fallback}", contact)).toBe("fallback");
  });

  test("hasTemplateSyntax agrees with what is replaced", () => {
    expect(hasTemplateSyntax("Hi {{firstname}}!")).toBe(true);
    expect(hasTemplateSyntax("Hi {firstname}!")).toBe(true);
    expect(hasTemplateSyntax("btoa({{phone}})")).toBe(true);

    expect(hasTemplateSyntax("Hi {{firstname}!")).toBe(false);
    expect(hasTemplateSyntax("Hi {firstname}}!")).toBe(false);
    expect(hasTemplateSyntax("plain text")).toBe(false);
  });
});
