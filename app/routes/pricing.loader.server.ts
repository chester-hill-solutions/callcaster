import { defineAction, defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: () => ({}),
});

export const action = defineAction({
  sideEffects: ["none"],
  handler: () => ({}),
});
