import Twilio from 'twilio';
import { env } from './lib/env.server';

export const twilio: Twilio.Twilio = singleton<Twilio.Twilio>(
  'twilio',
  () =>
    new Twilio.Twilio(env.TWILIO_SID(), env.TWILIO_AUTH_TOKEN()),
);

export async function sendSms(request: {
  from: string;
  to: string;
  body: string;
}) {
  return twilio.messages.create(request);
}

export function singleton<Value>(name: string, value: () => Value): Value {
  const g = global as any;
  g.__singletons ??= {};
  g.__singletons[name] ??= value();
  return g.__singletons[name];
}