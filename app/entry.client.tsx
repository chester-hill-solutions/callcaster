/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { HydratedRouter } from "react-router/dom";
import { installFlashTelemetry } from "@/lib/flash-telemetry.client";
import { Buffer } from "buffer-polyfill";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

globalThis.Buffer = Buffer as unknown as BufferConstructor;

// Observe transient error UI (toasts, alert banners) and ship each
// appearance to the server with a call-site stack + client breadcrumbs, so
// "an error flashed" is attributable from server logs (#1293).
installFlashTelemetry();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
});
