import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/logger.server", () => ({ logger: loggerMock }));

describe("errors.server", () => {
  beforeEach(() => {
    loggerMock.error.mockReset();
    loggerMock.warn.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("AppError toJSON includes details/code/status", async () => {
    const mod = await import("../app/lib/errors.server");
    const err = new mod.AppError("nope", 418, mod.ErrorCode.CONFLICT, { a: 1 });
    expect(err.toJSON()).toEqual({
      error: "nope",
      code: mod.ErrorCode.CONFLICT,
      statusCode: 418,
      details: { a: 1 },
    });

    // Covers default statusCode/code constructor params
    const err2 = new mod.AppError("defaults");
    expect(err2.statusCode).toBe(500);
    expect(err2.code).toBe(mod.ErrorCode.INTERNAL_SERVER_ERROR);
  });

  test("createErrorResponse handles AppError and attaches headers", async () => {
    const mod = await import("../app/lib/errors.server");
    const headers = new Headers({ "X-Test": "1" });
    const res = await asRouteResponse(
      mod.createErrorResponse(
        new mod.AppError("bad", 400, mod.ErrorCode.VALIDATION_ERROR, { field: "x" }),
        "fallback",
        500,
        { headers },
      ),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("X-Test")).toBe("1");
    await expect(res.json()).resolves.toMatchObject({
      error: "bad",
      code: mod.ErrorCode.VALIDATION_ERROR,
      statusCode: 400,
      details: { field: "x" },
    });
    // A 4xx is a client problem, not an application error. Logging every 404
    // and validation failure at error level is what made the error signal
    // meaningless, so severity now follows status.
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "http.error_response",
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  test("createErrorResponse logs 5xx at error level", async () => {
    const mod = await import("../app/lib/errors.server");
    const res = await asRouteResponse(
      mod.createErrorResponse(new Error("kaboom"), "fallback", 500),
    );
    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith(
      "http.error_response",
      expect.objectContaining({ statusCode: 500 }),
    );
  });

  test("createErrorResponse never echoes a plain Error's message", async () => {
    const mod = await import("../app/lib/errors.server");
    // A plain error's message is a driver's, a library's, or a wrapped
    // DrizzleQueryError's — it names tables, columns and bound values (#2888).
    const res = await asRouteResponse(
      mod.createErrorResponse(
        new Error(
          'Failed query: select "contact"."phone" from "contact" where "contact"."id" = $1\nparams: 7',
        ),
        "Could not load records",
        503,
      ),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Could not load records");
    expect(JSON.stringify(body)).not.toContain("contact");
    expect(JSON.stringify(body)).not.toContain("params");
    expect(JSON.stringify(body)).not.toContain("select");
    // The real message survives in the log, which is the point.
    expect(loggerMock.error).toHaveBeenCalledWith(
      "http.error_response",
      expect.objectContaining({
        err: expect.objectContaining({ message: expect.stringContaining("Failed query") }),
      }),
    );

    // Covers defaultMessage/defaultStatusCode defaults.
    const res2 = await asRouteResponse(mod.createErrorResponse(new Error("")));
    expect(res2.status).toBe(500);
    await expect(res2.json()).resolves.toMatchObject({
      error: "An error occurred",
      statusCode: 500,
    });
  });

  test("createErrorResponse handles {message} objects and unknowns", async () => {
    const mod = await import("../app/lib/errors.server");
    // An error-shaped object is still not a message written for callers.
    const res1 = await asRouteResponse(
      mod.createErrorResponse({ message: "m1" }, "fallback", 500),
    );
    await expect(res1.json()).resolves.toMatchObject({ error: "fallback" });

    const res1b = await asRouteResponse(
      mod.createErrorResponse({ message: "" } as any),
    );
    await expect(res1b.json()).resolves.toMatchObject({ error: "An error occurred" });

    const res2 = await asRouteResponse(
      mod.createErrorResponse(123, "fallback", 500),
    );
    await expect(res2.json()).resolves.toMatchObject({ error: "fallback" });
  });

  test("handleDatabaseError throws AppError and maps common codes", async () => {
    const mod = await import("../app/lib/errors.server");

    const capture = (fn: () => unknown) => {
      try {
        fn();
        throw new Error("expected throw");
      } catch (e) {
        return e as any;
      }
    };

    expect(capture(() => mod.handleDatabaseError(null))).toBeInstanceOf(mod.AppError);

    const e23505 = { code: "23505", message: "dup", details: "x" } as any;
    expect(capture(() => mod.handleDatabaseError(e23505, "ctx"))).toMatchObject({
      statusCode: 409,
      code: mod.ErrorCode.CONFLICT,
      message: "ctx: A record with these values already exists.",
    });

    const e23503 = { code: "23503", message: "fk", details: "x" } as any;
    expect(capture(() => mod.handleDatabaseError(e23503))).toMatchObject({
      statusCode: 400,
      code: mod.ErrorCode.VALIDATION_ERROR,
      message: "A referenced record does not exist.",
    });

    const eNotFound = { code: "PGRST116", message: "missing", details: "x" } as any;
    expect(capture(() => mod.handleDatabaseError(eNotFound))).toMatchObject({
      statusCode: 404,
      code: mod.ErrorCode.NOT_FOUND,
      message: "The requested record was not found.",
    });

    const eOther = { code: "99999", message: "nope", details: "x" } as any;
    expect(capture(() => mod.handleDatabaseError(eOther))).toMatchObject({
      statusCode: 500,
      code: mod.ErrorCode.DATABASE_ERROR,
      message: "The database operation failed.",
    });
  });

  test("handleAuthError throws a redirect Response with encoded message", async () => {
    const mod = await import("../app/lib/errors.server");
    try {
      mod.handleAuthError("please sign in");
      throw new Error("expected redirect");
    } catch (e: any) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBeGreaterThanOrEqual(300);
      expect((e as Response).status).toBeLessThan(400);
      expect((e as Response).headers.get("Location")).toBe("/signin");
      expect(decodeURIComponent((e as Response).headers.get("X-Error") ?? "")).toBe(
        "please sign in",
      );
    }

    // Covers default message param
    try {
      mod.handleAuthError();
      throw new Error("expected redirect");
    } catch (e: any) {
      expect(e).toBeInstanceOf(Response);
      expect(decodeURIComponent((e as Response).headers.get("X-Error") ?? "")).toBe(
        "Authentication required",
      );
    }
  });

  test("handleValidationError/handleNotFoundError/handleExternalServiceError throw AppError", async () => {
    const mod = await import("../app/lib/errors.server");
    const capture = (fn: () => unknown) => {
      try {
        fn();
        throw new Error("expected throw");
      } catch (e) {
        return e as any;
      }
    };

    expect(capture(() => mod.handleValidationError("bad", { a: 1 }))).toMatchObject({
      statusCode: 400,
      code: mod.ErrorCode.VALIDATION_ERROR,
      details: { a: 1 },
    });

    expect(capture(() => mod.handleNotFoundError("Thing", 3))).toMatchObject({
      statusCode: 404,
      code: mod.ErrorCode.NOT_FOUND,
      message: "Thing with ID 3 not found",
    });

    expect(capture(() => mod.handleNotFoundError("Thing"))).toMatchObject({
      statusCode: 404,
      code: mod.ErrorCode.NOT_FOUND,
      message: "Thing not found",
    });

    expect(capture(() => mod.handleNotFoundError())).toMatchObject({
      statusCode: 404,
      code: mod.ErrorCode.NOT_FOUND,
      message: "Resource not found",
    });

    expect(
      capture(() => mod.handleExternalServiceError("Twilio", new Error("down"), "send")),
    ).toMatchObject(
      {
        statusCode: 502,
        code: mod.ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: "send: Twilio service error: down",
      },
    );

    expect(capture(() => mod.handleExternalServiceError("Twilio", 123 as any))).toMatchObject({
      statusCode: 502,
      code: mod.ErrorCode.EXTERNAL_SERVICE_ERROR,
      message: "Twilio service error: 123",
    });
  });

  test("withErrorHandling passes through results and wraps unexpected errors", async () => {
    const mod = await import("../app/lib/errors.server");

    const ok = mod.withErrorHandling(async (x: number) => x + 1, "ctx");
    await expect(ok(1)).resolves.toBe(2);

    const appErr = new mod.AppError("app", 418, mod.ErrorCode.CONFLICT);
    const passthrough = mod.withErrorHandling(async () => {
      throw appErr;
    }, "ctx");
    await expect(passthrough()).rejects.toBe(appErr);

    const wrapped = mod.withErrorHandling(async () => {
      throw new Error("boom");
    }, "ctx");

    await expect(wrapped()).rejects.toMatchObject({
      statusCode: 500,
      code: mod.ErrorCode.INTERNAL_SERVER_ERROR,
      message: "ctx: An unexpected error occurred",
    });
    expect(loggerMock.error).toHaveBeenCalled();

    // Covers missing context branch
    const wrappedNoCtx = mod.withErrorHandling(async () => {
      throw new Error("boom");
    });
    await expect(wrappedNoCtx()).rejects.toMatchObject({
      statusCode: 500,
      code: mod.ErrorCode.INTERNAL_SERVER_ERROR,
      message: "An unexpected error occurred",
    });
  });
});

