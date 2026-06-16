import type { Call } from "@twilio/voice-sdk";

type TwilioListener = (...args: unknown[]) => void;

type TwilioEventEmitter = {
  on: (event: string, handler: TwilioListener) => void;
  off?: (event: string, handler: TwilioListener) => void;
  removeListener?: (event: string, handler: TwilioListener) => void;
  removeAllListeners?: (event?: string) => void;
};

/**
 * Attach a Twilio event listener and return cleanup that removes only that handler.
 */
export function attachTwilioListener(
  emitter: TwilioEventEmitter,
  event: string,
  handler: TwilioListener,
): () => void {
  emitter.on(event, handler);

  return () => {
    if (typeof emitter.off === "function") {
      emitter.off(event, handler);
      return;
    }
    if (typeof emitter.removeListener === "function") {
      emitter.removeListener(event, handler);
      return;
    }
    if (typeof emitter.removeAllListeners === "function") {
      emitter.removeAllListeners(event);
    }
  };
}

/** Attach a listener on a Twilio Voice SDK Call object. */
export function attachCallListener(
  call: Call,
  event: string,
  handler: TwilioListener,
): () => void {
  return attachTwilioListener(call as TwilioEventEmitter, event, handler);
}
