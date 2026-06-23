import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";

import { asRouteResponse } from "./helpers/route-result";

vi.mock("@scalar/api-reference-react", () => ({
  ApiReferenceReact: ({ configuration }: { configuration: { url: string } }) =>
    createElement("div", {
      "data-testid": "scalar-api-reference",
      "data-spec-url": configuration.url,
    }),
}));

vi.mock("@scalar/api-reference-react/style.css?url", () => ({
  default: "/mock-scalar.css",
}));

describe("app/routes/docs.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("loader returns empty object", async () => {
    const mod = await import("../app/routes/docs");
    await expect(mod.loader({} as never)).resolves.toEqual({});
  });

  test("exports Scalar stylesheet link", async () => {
    const mod = await import("../app/routes/docs");
    const links = mod.links?.({} as never);
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: "stylesheet", href: "/mock-scalar.css" }),
      ]),
    );
  });

  test("meta includes API docs title", async () => {
    const mod = await import("../app/routes/docs");
    const meta = mod.meta?.({} as never);
    expect(meta).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "CallCaster API Docs" }),
      ]),
    );
  });

  test("renders Scalar with openapi spec url after mount", async () => {
    const mod = await import("../app/routes/docs");
    const { container } = render(createElement(mod.default));

    await waitFor(() => {
      const el = container.querySelector("[data-testid='scalar-api-reference']");
      expect(el).not.toBeNull();
      expect(el?.getAttribute("data-spec-url")).toBe("/api/docs/openapi");
    });
  });
});

describe("app/routes/api+/docs/openapi/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("openapi route still serves spec", async () => {
    vi.mock("@/lib/openapi", () => ({
      openApiSpec: { openapi: "3.0.0", info: { title: "t" } },
    }));
    const mod = await import("../app/routes/api+/docs/openapi.route");
    const res = await asRouteResponse(
      await mod.loader({ request: new Request("http://x", { method: "GET" }) } as never),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ openapi: "3.0.0" });
  });
});
