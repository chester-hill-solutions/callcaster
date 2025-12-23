<<<<<<< HEAD
import Twilio from 'twilio';
import { env } from './lib/env.server';

export const twilio: Twilio.Twilio = singleton<Twilio.Twilio>(
  'twilio',
  () =>
    new Twilio.Twilio(env.TWILIO_SID(), env.TWILIO_AUTH_TOKEN()),
);
=======
import TwilioPkg from "twilio";

declare global {
  // eslint-disable-next-line no-var
  var __singletons: Record<string, unknown> | undefined;
}

export function singleton<Value>(name: string, factory: () => Value): Value {
  if (!global.__singletons) global.__singletons = {};
  if (!(name in global.__singletons)) {
    global.__singletons[name] = factory();
  }
  return global.__singletons[name] as Value;
}

type TwilioClient = InstanceType<typeof TwilioPkg.Twilio>;

export const twilio = singleton<TwilioClient>("twilio", () => {
  const sid = process.env["TWILIO_SID"]!;
  const token = process.env["TWILIO_AUTH_TOKEN"]!;
  return new TwilioPkg.Twilio(sid, token);
});
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

export async function sendSms(request: {
  from: string;
  to: string;
  body: string;
}) {
  return twilio.messages.create(request);
}