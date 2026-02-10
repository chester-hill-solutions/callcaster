/** @type {import('@remix-run/dev').AppConfig} */
export default {
  ignoredRouteFiles: ["**/.*", "**/*.test.{js,jsx,ts,tsx}", "**/twilio-serverless/**", "**/*.css"],
  // Bundle server-only deps so they are available when running the built server
  serverDependenciesToBundle: ["resend"],
  // appDirectory: "app",
  // assetsBuildDirectory: "public/build",
  // publicPath: "/build/",
  // serverBuildPath: "build/index.js",
  serverModuleFormat: 'esm',
  browserNodeBuiltinsPolyfill: {
    modules: {
      util: true, // Provide a JSPM polyfill
      stream: true, // Provide an empty polyfill
      https: true, // Provide an empty polyfill
      url: true, // Provide an empty polyfill
      os: true, // Provide an empty polyfill
      buffer: true, // Provide a JSPM polyfill
      fs: "empty", // Provide an empty polyfill
      events: true,
      window: true
    },
    globals: {
      Buffer: true,
    }
  }
};
