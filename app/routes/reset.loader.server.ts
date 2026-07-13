import { redirect } from "react-router";
import { defineAction, defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: () => redirect("/reset-password"),
});

export const action = defineAction({
  sideEffects: ["none"],
  handler: () => redirect("/reset-password"),
});
