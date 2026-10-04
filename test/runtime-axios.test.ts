import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import axios from "axios";
import twilio from "twilio";

vi.hoisted(() => { vi.unstubAllGlobals(); });

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

describe("runtime Axios security and Twilio compatibility", () => {
  let server: Server;
  let baseUrl: string;
  let handler: Handler;
  let targetHits: number;

  beforeEach(async () => {
    targetHits = 0;
    handler = (_request, response) => response.writeHead(404).end();
    server = createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { Location: `${baseUrl}/target` }).end();
      } else if (request.url === "/target") {
        targetHits += 1;
        response.writeHead(200, { "Content-Type": "application/json" }).end('{"reached":true}');
      } else {
        handler(request, response);
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing local server address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  // GHSA-r4gj-5m52-g5wh: the fetch adapter must honor the caller's redirect guard.
  test("fetch never reaches a redirect target when maxRedirects is zero", async () => {
    await expect(axios.get(`${baseUrl}/redirect`, {
      adapter: "fetch", maxRedirects: 0, timeout: 2000,
    })).rejects.toMatchObject({ response: { status: 302 } });
    expect(targetHits).toBe(0);
  });

  test("the same fetch guard permits a direct successful JSON response", async () => {
    const response = await axios.get(`${baseUrl}/target`, {
      adapter: "fetch", maxRedirects: 0, timeout: 2000,
    });
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ reached: true });
    expect(targetHits).toBe(1);
  });

  function client(options: { autoRetry?: boolean } = {}) {
    const sdk = twilio("ACfixture", "fixture-token", {
      ...options, keepAlive: false, timeout: 2000, maxRetryDelay: 1, maxRetries: 1,
    });
    sdk.api.baseUrl = baseUrl;
    return sdk;
  }

  test("the real SDK keeps authentication, repeated form values and response decoding", async () => {
    let captured: { method?: string; url?: string; authorization?: string; contentType?: string; body: string } | undefined;
    handler = (request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => { body += chunk; });
      request.on("end", () => {
        captured = { method: request.method, url: request.url, authorization: request.headers.authorization, contentType: request.headers["content-type"], body };
        response.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({
          sid: "SMfixture", account_sid: "ACfixture", status: "queued", body: "Hello & goodbye + café",
        }));
      });
    };
    const result = await client().messages.create({
      to: "+15555550101", from: "+15555550102", body: "Hello & goodbye + café",
      mediaUrl: ["https://example.invalid/one?a=1&b=2", "https://example.invalid/two"],
    });
    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe("/2010-04-01/Accounts/ACfixture/Messages.json");
    expect(captured?.authorization).toBe(`Basic ${Buffer.from("ACfixture:fixture-token").toString("base64")}`);
    expect(captured?.contentType).toContain("application/x-www-form-urlencoded");
    const form = new URLSearchParams(captured?.body);
    expect(form.get("To")).toBe("+15555550101");
    expect(form.get("From")).toBe("+15555550102");
    expect(form.get("Body")).toBe("Hello & goodbye + café");
    expect(form.getAll("MediaUrl")).toEqual(["https://example.invalid/one?a=1&b=2", "https://example.invalid/two"]);
    expect(result.sid).toBe("SMfixture");
    expect(result.accountSid).toBe("ACfixture");
    expect(result.status).toBe("queued");
  });

  test("the real SDK preserves provider errors without retrying a bad request", async () => {
    let requests = 0;
    handler = (_request, response) => {
      requests += 1;
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({
        code: 21211, message: "Invalid destination", more_info: "https://example.invalid/error/21211",
      }));
    };
    await expect(client({ autoRetry: true }).messages.create({
      to: "+15555550101", from: "+15555550102", body: "Local fixture",
    })).rejects.toMatchObject({ status: 400, code: 21211, message: "Invalid destination" });
    expect(requests).toBe(1);
  });

  test("the real SDK retries a rate limit once and decodes the later success", async () => {
    let requests = 0;
    handler = (_request, response) => {
      requests += 1;
      response.writeHead(requests === 1 ? 429 : 201, { "Content-Type": "application/json" }).end(JSON.stringify(
        requests === 1 ? { code: 20429, message: "Rate limited" } : { sid: "SMretry", status: "queued" },
      ));
    };
    const result = await client({ autoRetry: true }).messages.create({
      to: "+15555550101", from: "+15555550102", body: "Local fixture",
    });
    expect(requests).toBe(2);
    expect(result.sid).toBe("SMretry");
  });

  test("the real Twilio HTTP client keeps redirects disabled by default", async () => {
    const response = await client().httpClient.request({ method: "GET", uri: `${baseUrl}/redirect` });
    expect(response.statusCode).toBe(302);
    expect(targetHits).toBe(0);
  });
});
