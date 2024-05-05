import * as Twilio from 'twilio';

export const twilio: Twilio = singleton<Twilio>(
  'twilio',
  () =>
    new Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN),
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