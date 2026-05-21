import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  formatZodError,
  parseJsonBody,
  parseSearchParams,
  validationErrorResponse,
} from "../app/lib/api-parse.server";
import { asRouteResponse, normalizeRouteResult } from "./helpers/route-result";

describe("api-parse.server", () => {
  test("formatZodError includes path and message", () => {
    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toContain("name:");
    }
  });

  test("validationErrorResponse returns 400 json", async () => {
    const schema = z.object({ id: z.number() });
    const result = schema.safeParse({ id: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const res = await asRouteResponse(validationErrorResponse(result.error));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: expect.stringContaining("id:"),
      });
    }
  });

  test("parseJsonBody returns parsed data", async () => {
    const schema = z.object({ count: z.number() });
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 3 }),
    });
    await expect(parseJsonBody(request, schema)).resolves.toEqual({ count: 3 });
  });

  test("parseJsonBody throws 400 on schema failure", async () => {
    const schema = z.object({ count: z.number() });
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: "bad" }),
    });
    await expect(parseJsonBody(request, schema)).rejects.toSatisfy(
      async (thrown: unknown) => {
        const { status } = await normalizeRouteResult(thrown);
        expect(status).toBe(400);
        return true;
      },
    );
  });

  test("parseSearchParams returns ok data or error", () => {
    const schema = z.object({ limit: z.coerce.number().int().positive() });
    const ok = parseSearchParams(
      new URLSearchParams("limit=5"),
      schema,
    );
    expect(ok).toEqual({ ok: true, data: { limit: 5 } });

    const bad = parseSearchParams(
      new URLSearchParams("limit=-1"),
      schema,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toContain("limit:");
    }
  });
});
