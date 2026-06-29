# Bun as the single runtime

Bun replaces Express as the app server, and the Bun worker process handles long-running jobs. The custom 277-line Express server (`server/index.js`) is dropped entirely — `react-router-serve` (from React Router v8, non-breaking upgrade from v7) runs under Bun natively, handling healthchecks, graceful shutdown, and static serving. The worker is also Bun, same binary, different entry point. This drops `express`, `compression`, `cookie-parser`, `morgan`, `@react-router/express`, `tsx`, and the `buffer-polyfill` client shim (Bun has Buffer natively).

## Considered Options

- **Keep Express during migration, swap later** — carries boilerplate through the build for no benefit; Bun is ESM-native and RR8 is ESM-only, so Express (CommonJS-leaning) is a friction point.
- **Separate Deno runtime for Twilio webhooks** — reintroduces the dual-runtime duplication the IVR audit (`docs/ivr-remix-vs-edge-audit.md`) already complains about.

## References

- `server/index.js:155` (Express `createRequestHandler`), `node_modules/@react-router/express/dist/index.js:46` (adapter shim wrapping Fetch API into `req/res`)
- `package.json:69-70` (`@react-router/express` + `@react-router/node`)
- `app/buffer-polyfill.client.ts`, `package.json:8` (`build:buffer-polyfill` script)
- quick-canvass `package.json` `"start": "node scripts/run-instrumented.mjs react-router-serve ./build/server/index.js"` — proven pattern
