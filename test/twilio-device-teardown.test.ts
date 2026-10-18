import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { destroyTwilioDevice } from "@/lib/twilio/device-teardown.client";

const require = createRequire(import.meta.url);
const { Device, Call } = require("@twilio/voice-sdk");
const PStream = require(
  path.join(
    path.dirname(require.resolve("@twilio/voice-sdk")),
    "twilio/pstream.js",
  ),
).default;
const quiet = { debug() {}, info() {}, warn() {}, error() {} };

function fixture(sendSucceeds: boolean) {
  const resources = { media: 0, audio: 0, signaling: 0, sends: 0 };
  class Transport extends EventEmitter {
    open() {}
    close() {
      resources.signaling++;
    }
    send() {
      resources.sends++;
      return sendSucceeds;
    }
  }
  class Audio extends EventEmitter {
    _destroy() {
      resources.audio++;
    }
  }
  const device = new Device("fixture-token", {
    AudioHelper: Audio,
    logLevel: "silent",
    publishEvents: false,
  });
  const stream = new PStream("fixture-token", ["wss://fixture.invalid"], {
    TransportFactory: Transport,
  });
  stream.status = "connected";
  stream._log = quiet;
  device._stream = stream;
  stream.on("error", device._onSignalingError);
  function call(state: string = "open") {
    const leg = Object.assign(Object.create(Call.prototype), {
      _log: quiet,
      _status: state,
      _shouldSendHangup: true,
      parameters: { CallSid: `CAfixture-${resources.media}-${state}` },
      _pstream: stream,
      _publisher: { info() {} },
      _cleanupEventListeners() {},
    });
    EventEmitter.call(leg);
    leg._mediaHandler = {
      reject() {},
      close() {
        resources.media++;
        leg._status = "closed";
        leg.emit("disconnect", leg);
      },
    };
    return leg;
  }
  const active = call();
  device._activeCall = active;
  const pending = call("pending");
  device._calls = [pending];
  const held = call();
  return { device, stream, active, pending, held, resources };
}

describe("installed Twilio SDK teardown (#2706)", () => {
  test("an unhandled real signaling error interrupts the installed destroy path", () => {
    const { device, resources } = fixture(false);
    expect(() => device.destroy()).toThrow();
    expect(resources).toMatchObject({ media: 0, audio: 0, signaling: 0 });
    device.on("error", () => {});
    device.destroy();
  });

  test.each([true, false])(
    "closes active, pending and held media, signaling and audio when transport send succeeds=%s",
    (sendSucceeds) => {
      const { device, active, pending, held, resources } =
        fixture(sendSucceeds);
      const result = destroyTwilioDevice(device, [active, held, pending, held]);
      expect(result.destroyed).toBe(true);
      expect(resources).toMatchObject({ media: 3, audio: 1, signaling: 1 });
      expect(device.state).toBe("destroyed");
      const before = { ...resources };
      expect(
        destroyTwilioDevice(device, [active, pending, held]).destroyed,
      ).toBe(true);
      expect(resources).toEqual(before);
      expect(device.listenerCount("error")).toBe(0);
    },
  );

  test("a direct SDK exception reports incomplete destruction and does not skip another owned call", () => {
    const { device, stream, active, held, resources } = fixture(true);
    const localTrack = { stop: vi.fn() };
    const remoteTrack = { stop: vi.fn() };
    active._mediaHandler.stream = { getTracks: () => [localTrack] };
    active._mediaHandler._remoteStream = { getTracks: () => [remoteTrack] };
    stream.hangup = () => {
      throw new Error("Unexpected SDK exception");
    };
    held._pstream = null;
    const result = destroyTwilioDevice(device, [active, held]);
    expect(result.destroyed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(held.status()).toBe("closed");
    expect(resources.media).toBe(2);
    expect(resources.audio).toBe(0);
    expect(resources.signaling).toBe(0);
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
    expect(remoteTrack.stop).toHaveBeenCalledTimes(1);
    stream.hangup = () => {};
    device.destroy();
  });
  test("a held call exception remains visible after Device.destroy and can be retried", () => {
    const { device, active, pending, held, resources } = fixture(true);
    held._pstream = {
      status: "connected",
      hangup() {
        throw new Error("Unexpected held call exception");
      },
    };
    const result = destroyTwilioDevice(device, [active, held, pending]);
    expect(result.destroyed).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(device.state).toBe("destroyed");
    expect(held.status()).toBe("open");
    expect(resources).toMatchObject({ media: 2, audio: 1, signaling: 1 });
    expect(device.listenerCount("error")).toBe(1);
    held._pstream.status = "disconnected";
    expect(destroyTwilioDevice(device, [held])).toEqual({
      destroyed: true,
      errors: [],
    });
    expect(held.status()).toBe("closed");
    expect(resources).toMatchObject({ media: 3, audio: 1, signaling: 1 });
    expect(device.listenerCount("error")).toBe(0);
  });
  test.each([false, true])(
    "removes the temporary guard after an externally closed held call; existing listener=%s",
    (hasExistingListener) => {
      const { device, held, resources } = fixture(true);
      const existingErrorListener = () => {};
      if (hasExistingListener) held.on("error", existingErrorListener);
      held._pstream = {
        status: "connected",
        hangup() {
          throw new Error("Held call could not disconnect");
        },
      };
      const partial = destroyTwilioDevice(device, [held]);
      expect(partial.errors.length).toBeGreaterThan(0);
      expect(held.status()).toBe("open");
      expect(held.listenerCount("error")).toBe(hasExistingListener ? 2 : 1);
      held._pstream.status = "disconnected";
      held.disconnect();
      expect(held.status()).toBe("closed");
      const before = { ...resources };
      expect(destroyTwilioDevice(device, [held])).toEqual({
        destroyed: true,
        errors: [],
      });
      expect(held.listenerCount("error")).toBe(hasExistingListener ? 1 : 0);
      if (hasExistingListener)
        expect(held.listeners("error")).toEqual([existingErrorListener]);
      expect(resources).toEqual(before);
    },
  );
});
