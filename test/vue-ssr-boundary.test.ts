import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { JSDOM } from "jsdom";

async function withRenderedElement(
  props: Record<string, unknown>,
  verify: (element: Element) => void,
) {
  const html = await renderToString(
    createSSRApp({ render: () => h("div", props, "owned test") }),
  );
  const dom = new JSDOM(html);
  try {
    const element = dom.window.document.querySelector("div");
    expect(element).not.toBeNull();
    if (!element) throw new Error("The renderer did not emit the test element");
    verify(element);
  } finally {
    dom.window.close();
  }
}

describe("installed Vue SSR attribute boundary (GHSA-g2v6-rqmx-r4w6)", () => {
  it.each([
    "data-safe\rdata-injected",
    "title\rdata-injected",
    "data-safe\rdata-injected\rautofocus",
  ])("rejects a carriage-return attribute name: %j", async (name) => {
    await withRenderedElement(
      { title: "valid", [name]: "owned-marker" },
      (el) => {
        expect(el.getAttribute("data-injected")).toBeNull();
        expect(el.hasAttribute("autofocus")).toBe(false);
        expect(el.getAttribute("title")).toBe("valid");
      },
    );
  });

  it.each(["\t", "\n", "\f", " "])(
    "keeps rejecting other HTML whitespace in names: %j",
    async (space) => {
      await withRenderedElement(
        { title: "valid", [`data-safe${space}data-injected`]: "owned-marker" },
        (el) => {
          expect(el.getAttribute("data-injected")).toBeNull();
          expect(el.getAttribute("title")).toBe("valid");
        },
      );
    },
  );

  it("preserves ordinary attributes", async () => {
    await withRenderedElement(
      { title: "valid", "data-proof": "owned-marker" },
      (el) => {
        expect(el.getAttribute("title")).toBe("valid");
        expect(el.getAttribute("data-proof")).toBe("owned-marker");
      },
    );
  });

  it("escapes an untrusted value within its one attribute", async () => {
    const value = '"><span data-injected="owned">&';
    await withRenderedElement({ title: value }, (el) => {
      expect(el.getAttribute("title")).toBe(value);
      expect(el.children).toHaveLength(0);
      expect(el.textContent).toBe("owned test");
    });
  });

  it("preserves a boolean attribute", async () => {
    await withRenderedElement({ disabled: true, title: "valid" }, (el) => {
      expect(el.hasAttribute("disabled")).toBe(true);
      expect(el.getAttribute("title")).toBe("valid");
    });
  });
});
