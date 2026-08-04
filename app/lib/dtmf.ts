/**
 * DTMF keypad constants and tone generation.
 *
 * `KEYPAD_KEYS` is typed as `string` to match `KeyboardEvent.key` so it can be
 * used directly with `Array.includes(e.key)` in keyboard handlers.
 */
export const KEYPAD_KEYS: readonly string[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "*",
  "0",
  "#",
];

const dtmfFrequencies: { [key: string]: [number, number] } = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

export const playTone = (tone: string, audioContext: AudioContext) => {
  if (!audioContext) return;

  const toneFrequencies = dtmfFrequencies[tone];
  if (!toneFrequencies) return;
  const [lowFreq, highFreq] = toneFrequencies;
  const duration = 0.15;

  const oscillator1 = audioContext.createOscillator();
  oscillator1.type = "sine";
  oscillator1.frequency.setValueAtTime(lowFreq, audioContext.currentTime);

  const oscillator2 = audioContext.createOscillator();
  oscillator2.type = "sine";
  oscillator2.frequency.setValueAtTime(highFreq, audioContext.currentTime);

  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

  oscillator1.connect(gainNode);
  oscillator2.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator1.start();
  oscillator2.start();
  oscillator1.stop(audioContext.currentTime + duration);
  oscillator2.stop(audioContext.currentTime + duration);
};
