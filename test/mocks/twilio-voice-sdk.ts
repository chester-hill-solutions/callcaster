import { vi } from "vitest";

const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

export const mockTwilioDevice = {
  state: "unregistered",
  calls: [] as unknown[],
  on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
    listeners[event] ??= [];
    listeners[event].push(fn);
    return mockTwilioDevice;
  }),
  removeAllListeners: vi.fn((event?: string) => {
    if (event) delete listeners[event];
    else Object.keys(listeners).forEach((k) => delete listeners[k]);
  }),
  register: vi.fn(async () => {
    mockTwilioDevice.state = "registered";
    for (const fn of listeners.registered ?? []) fn();
  }),
  unregister: vi.fn(async () => {
    mockTwilioDevice.state = "unregistered";
  }),
  connect: vi.fn(async () => ({
    parameters: { CallSid: "CA-mock", To: "client:user" },
    accept: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn().mockReturnThis(),
    removeAllListeners: vi.fn(),
    mute: vi.fn(),
  })),
  disconnectAll: vi.fn(),
  emit: (event: string, ...args: unknown[]) => {
    for (const fn of listeners[event] ?? []) fn(...args);
  },
};

export class Device {
  constructor(_token: string, _opts?: unknown) {
    return mockTwilioDevice as unknown as Device;
  }
}

export class Call {}

export function resetTwilioVoiceSdkMock() {
  Object.keys(listeners).forEach((key) => delete listeners[key]);
  mockTwilioDevice.state = "unregistered";
  mockTwilioDevice.on.mockClear();
  mockTwilioDevice.removeAllListeners.mockClear();
  mockTwilioDevice.register.mockClear();
  mockTwilioDevice.unregister.mockClear();
  mockTwilioDevice.connect.mockClear();
  mockTwilioDevice.disconnectAll.mockClear();
}
