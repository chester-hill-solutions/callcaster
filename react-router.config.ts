import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  serverModuleFormat: "esm",
  // Note: `serverDependenciesToBundle` is a Remix v2 option not supported by
  // React Router 7/8; removed 2026-08-03. `resend` is imported by 8 server-only
  // modules and appears to work without bundling.
} satisfies Config;
