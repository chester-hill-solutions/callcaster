import type { AppLoadContext } from "react-router";

declare module "react-router" {
  interface AppLoadContext {
    // Extend when load context is wired through the custom server.
  }
}

export type { AppLoadContext };
