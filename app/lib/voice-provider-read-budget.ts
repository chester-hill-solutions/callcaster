/** Only read provider facts here; apply owned writes after this promise resolves. */
export async function withVoiceProviderReadBudget<T>(read: (requireActive: () => void) => Promise<T>, milliseconds: number, message: string) {
  let accepting = true, deadline: ReturnType<typeof setTimeout> | undefined;
  const requireActive = () => { if (!accepting) throw new Error(message); };
  try {
    return await Promise.race([read(requireActive), new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { accepting = false; clearTimeout(deadline); }
}
