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
  const totalUnits = gsm7Units ?? totalCharacters;

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
