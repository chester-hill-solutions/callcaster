import { describe, expect, test } from "vitest";
import {
  API_KEY_CAPABILITY_OPTIONS,
  filterApiKeyCapabilityOptions,
  groupApiKeyCapabilityOptions,
  parseApiKeyScopesFromForm,
  visibleApiKeyCapabilityCategories,
} from "@/lib/api-key-capabilities.shared";

describe("api-key-capabilities.shared", () => {
  test("catalog covers every product capability with categories", () => {
    expect(API_KEY_CAPABILITY_OPTIONS.length).toBe(8);
    const categories = groupApiKeyCapabilityOptions(API_KEY_CAPABILITY_OPTIONS).map(
      (entry) => entry.category,
    );
    expect(categories).toEqual(["Campaigns", "Telephony", "Messaging", "Workspace"]);
  });

  test("filters by capability id or description", () => {
    const hits = filterApiKeyCapabilityOptions(API_KEY_CAPABILITY_OPTIONS, "invite");
    expect(hits.map((h) => h.value)).toEqual(["members.invite"]);
  });

  test("selected tab returns only chosen capabilities", () => {
    const categories = visibleApiKeyCapabilityCategories({
      options: API_KEY_CAPABILITY_OPTIONS,
      query: "",
      tab: "selected",
      selected: new Set(["messages.send", "audit.read"]),
    });
    expect(categories.flatMap((c) => c.options.map((o) => o.value))).toEqual([
      "messages.send",
      "audit.read",
    ]);
  });

  test("parseApiKeyScopesFromForm allowlists known scopes and rejects empty", () => {
    const form = new FormData();
    form.append("scopes", "messages.send");
    form.append("scopes", "not.a.capability");
    form.append("scopes", "calls.start");
    expect(parseApiKeyScopesFromForm(form)).toEqual(["messages.send", "calls.start"]);

    const empty = new FormData();
    expect(parseApiKeyScopesFromForm(empty)).toEqual([]);
  });
});
