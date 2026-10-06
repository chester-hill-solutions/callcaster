import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const shadcnRequire = createRequire(require.resolve("shadcn"));
const consumers = [
  { name: "development Express", require },
  {
    name: "shadcn MCP Express",
    require: createRequire(
      shadcnRequire.resolve("@modelcontextprotocol/sdk/server/express.js"),
    ),
  },
];

interface ExpressApplication {
  set(name: string, value: string): void;
}

interface ExpressFactory {
  (): ExpressApplication;
  request: object;
}

interface ExpressRequest {
  app: ExpressApplication;
  socket: { remoteAddress: string };
  headers: { "x-forwarded-for": string };
  readonly ip: string;
}

for (const consumer of consumers) {
  describe(`${consumer.name} installed proxy trust`, () => {
    const express: ExpressFactory = consumer.require("express");
    const expressRequire = createRequire(consumer.require.resolve("express"));
    const proxy: { compile(subnet: string): (ip: string) => boolean } =
      expressRequire("proxy-addr");

    function clientIp(subnet: string, remoteAddress: string): string {
      const app = express();
      app.set("trust proxy", subnet);
      const request: ExpressRequest = Object.create(express.request);
      request.app = app;
      request.socket = { remoteAddress };
      request.headers = { "x-forwarded-for": "203.0.113.77" };
      return request.ip;
    }

    test.each(["::ffff:10.0.0.0/8", "::/1"])(
      "%s does not trust an unrelated IPv4 client",
      (subnet) => {
        expect(proxy.compile(subnet)("198.51.100.99")).toBe(false);
      },
    );

    test.each(["::ffff:10.0.0.0/8", "::/1"])(
      "%s ignores a forwarded header from an unrelated IPv4 client",
      (subnet) => {
        expect(clientIp(subnet, "198.51.100.99")).toBe("198.51.100.99");
      },
    );

    test.each([
      { subnet: "10.0.0.0/8", ip: "10.1.2.3", trusted: true },
      { subnet: "10.0.0.0/8", ip: "198.51.100.99", trusted: false },
      { subnet: "::ffff:10.0.0.0/104", ip: "10.1.2.3", trusted: true },
      { subnet: "::ffff:10.0.0.0/104", ip: "198.51.100.99", trusted: false },
      { subnet: "::1/128", ip: "::1", trusted: true },
      { subnet: "::1/128", ip: "::2", trusted: false },
    ])("$subnet retains the trust rule for $ip", ({ subnet, ip, trusted }) => {
      expect(proxy.compile(subnet)(ip)).toBe(trusted);
    });

    test("retains the forwarded client from a valid IPv4 proxy", () => {
      expect(clientIp("10.0.0.0/8", "10.1.2.3")).toBe("203.0.113.77");
    });
  });
}
