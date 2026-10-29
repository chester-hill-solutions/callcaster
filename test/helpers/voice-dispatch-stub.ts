/** Adapter tests use this boundary; real funding and persistence run in the database tier. */
export async function acceptVoiceDispatch(args: {
  voiceUrl: string;
  statusCallback: string;
  prepareOutreach?: (tx: object) => Promise<number>;
  beforeCreate?: () => void | Promise<void>;
  create: (urls: { voiceUrl: string; statusCallback: string }) => Promise<{ sid: string }>;
}) {
  await args.prepareOutreach?.({});
  await args.beforeCreate?.();
  const call = await args.create({ voiceUrl: args.voiceUrl, statusCallback: args.statusCallback });
  return { ok: true as const, callSid: call.sid, replayed: false };
}
