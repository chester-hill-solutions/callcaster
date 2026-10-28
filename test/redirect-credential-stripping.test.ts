import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import type {
  ClientRequest,
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
  RequestOptions,
  Server,
} from "node:http";
import { describe, expect, test } from "vitest";

const rootRequire = createRequire(import.meta.url);
const twilioRequire = createRequire(rootRequire.resolve("twilio"));
const axiosRequire = createRequire(twilioRequire.resolve("axios"));
const followRedirects: {
  http: {
    request(
      options: RequestOptions & { sensitiveHeaders?: string[] },
      listener: (response: IncomingMessage) => void,
    ): ClientRequest;
  };
} = axiosRequire("follow-redirects");

function port(server: Server) {
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Loopback server has no TCP port");
  return address.port;
}

async function redirected(
  headers: OutgoingHttpHeaders | string[],
  sensitiveHeaders: string[] = [],
  sameOrigin = false,
) {
  let received: IncomingHttpHeaders | undefined;
  const target = createServer((request, response) => {
    received = request.headers;
    response.end("ok");
  });
  const source = createServer((request, response) => {
    if (request.url === "/done") {
      received = request.headers;
      response.end("ok");
      return;
    }
    response.writeHead(302, {
      Location: `http://127.0.0.1:${port(sameOrigin ? source : target)}/done`,
    });
    response.end();
  });
  try {
    target.listen(0, "127.0.0.1");
    await once(target, "listening");
    source.listen(0, "127.0.0.1");
    await once(source, "listening");
    const outgoing = Array.isArray(headers)
      ? [...headers, "Host", `127.0.0.1:${port(source)}`]
      : headers;
    await new Promise<void>((resolve, reject) => {
      const request = followRedirects.http.request(
        {
          hostname: "127.0.0.1",
          port: port(source),
          path: "/start",
          headers: outgoing,
          sensitiveHeaders,
          agent: false,
        },
        (response) => {
          response.on("error", reject);
          response.on("end", () =>
            response.statusCode === 200
              ? resolve()
              : reject(
                  new Error(`Owned fixture returned ${response.statusCode}`),
                ),
          );
          response.resume();
        },
      );
      request.setTimeout(5000, () =>
        request.destroy(new Error("Owned redirect fixture timed out")),
      );
      request.on("error", reject);
      request.end();
    });
    if (!received) throw new Error("Redirect did not reach its destination");
    return received;
  } finally {
    await Promise.all(
      [source, target].map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          }),
      ),
    );
  }
}

describe("Twilio's installed redirect dependency (#3073)", () => {
  test("array-form credentials are stripped across origins while a public header survives", async () => {
    const headers = await redirected([
      "Authorization",
      "fixture-auth",
      "Cookie",
      "fixture-cookie",
      "Proxy-Authorization",
      "fixture-proxy",
      "X-Trace",
      "fixture-public",
    ]);
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers["proxy-authorization"]).toBeUndefined();
    expect(headers["x-trace"]).toBe("fixture-public");
  });

  test.each(["x^credential", "x|credential"])(
    "declared %s is stripped across origins",
    async (name) => {
      const headers = await redirected(
        { [name]: "fixture-secret", "X-Trace": "fixture-public" },
        [name],
      );
      expect(headers[name]).toBeUndefined();
      expect(headers["x-trace"]).toBe("fixture-public");
    },
  );

  test("ordinary object credentials are stripped across origins", async () => {
    const headers = await redirected({
      Authorization: "fixture-auth",
      Cookie: "fixture-cookie",
      "X-Trace": "fixture-public",
    });
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers["x-trace"]).toBe("fixture-public");
  });

  test("same-origin array credentials remain available", async () => {
    const headers = await redirected(
      ["Authorization", "fixture-auth", "X-Trace", "fixture-public"],
      [],
      true,
    );
    expect(headers.authorization).toBe("fixture-auth");
    expect(headers["x-trace"]).toBe("fixture-public");
  });

  test("ordinary public redirects keep public headers", async () => {
    const headers = await redirected({ "X-Trace": "fixture-public" });
    expect(headers["x-trace"]).toBe("fixture-public");
  });
});
