import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  serverModuleFormat: "esm",
  serverDependenciesToBundle: ["resend"],
  future: {
    v8_splitRouteModules: true,
  },
} satisfies Config;
