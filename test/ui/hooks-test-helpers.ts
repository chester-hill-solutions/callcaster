import { vi } from "vitest";

export function mockLoggerClient() {
  vi.mock("@/lib/logger.client", () => ({
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  }));
}

export function createMockFetcher<T = unknown>(overrides: Partial<{
  state: string;
  data: T;
  submit: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    state: "idle",
    data: undefined,
    formData: undefined,
    formMethod: undefined,
    formAction: undefined,
    submit: vi.fn(),
    load: vi.fn(),
    ...overrides,
  };
}

type ChannelHandler = (payload: unknown) => void;
type StatusHandler = (status: string) => void;

export function createSupabaseRealtimeMock() {
  const handlers: ChannelHandler[] = [];
  const statusHandlers: StatusHandler[] = [];

  const channel = {
    on: vi.fn((_event: string, _filter: unknown, handler: ChannelHandler) => {
      handlers.push(handler);
      return channel;
    }),
    subscribe: vi.fn((cb?: StatusHandler) => {
      if (cb) statusHandlers.push(cb);
      queueMicrotask(() => cb?.("SUBSCRIBED"));
      return channel;
    }),
    unsubscribe: vi.fn(),
  };

  const supabase = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
        or: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: "none" } })),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          or: vi.fn(async () => ({ error: null })),
        })),
      })),
    })),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  };

  return {
    supabase,
    channel,
    emitPayload: (payload: unknown) => {
      for (const h of handlers) h(payload);
    },
    emitStatus: (status: string) => {
      for (const h of statusHandlers) h(status);
    },
  };
}

export function installIntersectionObserverMock() {
  class MockIntersectionObserver {
    private readonly callback: IntersectionObserverCallback;
    readonly observe = vi.fn((target: Element) => {
      this.callback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
            target,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
            time: Date.now(),
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver,
      );
    });
    readonly unobserve = vi.fn();
    readonly disconnect = vi.fn();
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
}

export function createMockTwilioCall(overrides: Record<string, unknown> = {}) {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const call = {
    parameters: { CallSid: "CA123", To: "client:user" },
    accept: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      listeners[event] ??= [];
      listeners[event].push(fn);
      return call;
    }),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) delete listeners[event];
      else Object.keys(listeners).forEach((k) => delete listeners[k]);
    }),
    mute: vi.fn(),
    emit: (event: string, ...args: unknown[]) => {
      for (const fn of listeners[event] ?? []) fn(...args);
    },
    ...overrides,
  };
  return call;
}

export function createMockTwilioDevice() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const device = {
    state: "unregistered",
    calls: [] as unknown[],
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      listeners[event] ??= [];
      listeners[event].push(fn);
      return device;
    }),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) delete listeners[event];
      else Object.keys(listeners).forEach((k) => delete listeners[k]);
    }),
    register: vi.fn(async () => {
      device.state = "registered";
      for (const fn of listeners.registered ?? []) fn();
    }),
    unregister: vi.fn(async () => {
      device.state = "unregistered";
    }),
    connect: vi.fn(async () => createMockTwilioCall()),
    disconnectAll: vi.fn(),
    emit: (event: string, ...args: unknown[]) => {
      for (const fn of listeners[event] ?? []) fn(...args);
    },
  };
  return device;
}
