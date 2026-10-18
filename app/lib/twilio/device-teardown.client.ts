import type { Call, Device } from "@twilio/voice-sdk";
import { attachTwilioListener } from "./call-listener-utils.client";

export type DeviceTeardownResult = { destroyed: boolean; errors: unknown[] };
const tearingDown = new WeakSet<Device>();
const errorGuards = new WeakMap<object, () => void>();

function guardErrors(emitter: Device | Call): () => void {
  const existing = errorGuards.get(emitter);
  if (existing) return existing;
  // The SDK emits transport errors synchronously inside disconnect/destroy.
  const remove = attachTwilioListener(emitter, "error", () => {});
  const cleanup = () => {
    remove();
    errorGuards.delete(emitter);
  };
  errorGuards.set(emitter, cleanup);
  return cleanup;
}

function stopCallTracks(call: Call, errors: unknown[]) {
  for (const getStream of [call.getLocalStream, call.getRemoteStream]) {
    try {
      const stream = getStream?.call(call);
      for (const track of stream?.getTracks() ?? []) {
        try {
          track.stop();
        } catch (error) {
          errors.push(error);
        }
      }
    } catch (error) {
      errors.push(error);
    }
  }
}

/** Device.calls omits the active leg and calls held by the app. */
export function destroyTwilioDevice(
  device: Device,
  ownedCalls: readonly (Call | null)[] = [],
): DeviceTeardownResult {
  if (tearingDown.has(device)) return { destroyed: false, errors: [] };
  tearingDown.add(device);
  const errors: unknown[] = [];
  const guards = [guardErrors(device)];
  let destroyed = device.state === "destroyed";
  try {
    const calls = new Set([...(device.calls ?? []), ...ownedCalls]);
    for (const call of calls) {
      if (!call) continue;
      if (call.status?.() === "closed") {
        errorGuards.get(call)?.();
        continue;
      }
      try {
        guards.push(guardErrors(call));
      } catch (error) {
        errors.push(error);
      }
      try {
        if (call.status?.() === "pending") call.reject();
        else call.disconnect();
      } catch (error) {
        errors.push(error);
        stopCallTracks(call, errors);
      }
    }
    if (!destroyed) {
      try {
        device.destroy();
        destroyed = true;
      } catch (error) {
        errors.push(error);
      }
    }
  } finally {
    tearingDown.delete(device);
    // An incomplete SDK destroy can still emit errors. Keep its safe listeners.
    if (destroyed && errors.length === 0) {
      guards.forEach((cleanup) => cleanup());
    } else if (destroyed) {
      // Device.destroy removes listeners even when an app-owned held call is still open.
      errorGuards.get(device)?.();
      guardErrors(device);
    }
  }
  return { destroyed, errors };
}
