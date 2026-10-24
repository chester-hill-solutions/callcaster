import type { FullConfig } from "@playwright/test";
import { createSimRuntimeContext } from "./runtime-context";
import { prepareSimSmsTaskContexts } from "./preflight";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const [owner, member] = await Promise.all([
    createSimRuntimeContext({ personaKey: "person-a" }),
    createSimRuntimeContext({ personaKey: "person-b" }),
  ]);
  await prepareSimSmsTaskContexts({ owner, member });
  const baseURL =
    (config.projects[0]?.use?.baseURL as string | undefined) ??
    "http://127.0.0.1:3000";
  const response = await fetch(`${baseURL}/signin`);
  if (!response.ok) {
    throw new Error(`Sim target UI is not reachable at ${baseURL}/signin (${response.status}).`);
  }
}
