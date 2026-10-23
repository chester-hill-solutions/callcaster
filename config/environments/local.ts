import type { ProjectConfigOverlay } from "../schema";

export const localConfig = {
  environment: "local",
  urls: { publicApp: "http://localhost:3000" },
  storage: {
    endpoint: "http://127.0.0.1:9000",
    host: "127.0.0.1",
    bucket: "callcaster",
    region: "us-east-1",
  },
} satisfies ProjectConfigOverlay;
