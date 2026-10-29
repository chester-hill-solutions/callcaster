import { vi } from "vitest";

// These route fixtures predate funded voice. Keep their legacy ownership
// explicit; the real reservation paths run in the PostgreSQL integration suite.
vi.mock("@/server/voice-bridge-reservation.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/voice-bridge-reservation.server")>(),
  findVoiceReservationForCall: async () => null,
  hasVoiceReservationCallBinding: async () => false,
}));
vi.mock("@/server/voice-terminal-outcome.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/voice-terminal-outcome.server")>(),
  enqueueFundedVoiceTerminalOutcome: async () => null,
}));
