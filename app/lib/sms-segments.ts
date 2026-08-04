export type SmsEncoding = "GSM-7" | "UCS-2";

export type SmsSegmentInfo = {
  encoding: SmsEncoding;
  totalCharacters: number;
  totalUnits: number;
  segmentCount: number;
  unitsPerSegment: number;
  unitsUsedInCurrentSegment: number;
  unitsRemainingInCurrentSegment: number;
};

const GSM_7_EXTENSION_CHARACTERS = new Set([
  "^",
  "{",
  "}",
  "\\",
  "[",
  "~",
  "]",
  "|",
  "€",
]);

const GSM_7_BASIC_CHARACTERS = new Set([
  "@",
  "£",
  "$",
  "¥",
  "è",
  "é",
  "ù",
  "ì",
  "ò",
  "Ç",
  "\n",
  "Ø",
  "ø",
  "\r",
  "Å",
  "å",
  "Δ",
  "_",
  "Φ",
  "Γ",
  "Λ",
  "Ω",
  "Π",
  "Ψ",
  "Σ",
  "Θ",
  "Ξ",
  "\u001B",
  "Æ",
  "æ",
  "ß",
  "É",
  " ",
  "!",
  "\"",
  "#",
  "¤",
  "%",
  "&",
  "'",
  "(",
  ")",
  "*",
  "+",
  ",",
  "-",
  ".",
  "/",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ":",
  ";",
  "<",
  "=",
  ">",
  "?",
  "¡",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "Ä",
  "Ö",
  "Ñ",
  "Ü",
  "§",
  "¿",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "ä",
  "ö",
  "ñ",
  "ü",
  "à",
]);

function getCharacterCount(text: string): number {
  return Array.from(text).length;
}

function getGsm7Units(text: string): number | null {
  let units = 0;

  for (const character of text) {
    if (GSM_7_BASIC_CHARACTERS.has(character)) {
      units += 1;
      continue;
    }

    if (GSM_7_EXTENSION_CHARACTERS.has(character)) {
      units += 2;
      continue;
    }

    return null;
  }

  return units;
}

export function getSmsSegmentInfo(text: string): SmsSegmentInfo {
  const totalCharacters = getCharacterCount(text);
  const gsm7Units = getGsm7Units(text);
  const encoding: SmsEncoding = gsm7Units == null ? "UCS-2" : "GSM-7";
  // UCS-2 SMS segmentation is billed in UTF-16 code units, not Unicode code
  // points: an astral-plane character (most emoji, e.g. U+1F525 "fire") is
  // encoded as a surrogate pair and consumes 2 units of the 70/67-character
  // budget even though it displays as a single glyph. `text.length` counts
  // UTF-16 code units directly, so use it here instead of the code-point
  // count used for the human-facing `totalCharacters` field below.
  const totalUnits = gsm7Units ?? text.length;

  const singleSegmentLimit = encoding === "GSM-7" ? 160 : 70;
  const multiSegmentLimit = encoding === "GSM-7" ? 153 : 67;
  const unitsPerSegment =
    totalUnits > singleSegmentLimit ? multiSegmentLimit : singleSegmentLimit;
  const segmentCount =
    totalUnits === 0 ? 0 : Math.ceil(totalUnits / unitsPerSegment);
  const unitsUsedInCurrentSegment =
    segmentCount === 0
      ? 0
      : totalUnits - (segmentCount - 1) * unitsPerSegment;
  const unitsRemainingInCurrentSegment =
    segmentCount === 0 ? unitsPerSegment : unitsPerSegment - unitsUsedInCurrentSegment;

  return {
    encoding,
    totalCharacters,
    totalUnits,
    segmentCount,
    unitsPerSegment,
    unitsUsedInCurrentSegment,
    unitsRemainingInCurrentSegment,
  };
}

export type SegmentEstimate = {
  segments: number;
  encoding: SmsEncoding;
};

/**
 * Minimal segment estimate — just the two fields SMS billing cares about
 * (see SMS_SEGMENT_CREDITS in shared/pricing.ts, which multiplies `segments`
 * by the per-segment credit rate). Thin wrapper around getSmsSegmentInfo()
 * for callers that don't need the full unit-accounting breakdown.
 */
export function estimateSegments(body: string): SegmentEstimate {
  const { segmentCount, encoding } = getSmsSegmentInfo(body);
  return { segments: segmentCount, encoding };
}
