import type { FullConfig } from "@playwright/test";

async function waitForReady(baseURL: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${baseURL}/readyz`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`E2E server not ready at ${baseURL}/readyz`);
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    (config.projects[0]?.use?.baseURL as string | undefined) ??
    process.env.E2E_BASE_URL ??
    "http://localhost:3000";
  await waitForReady(baseURL);
}
