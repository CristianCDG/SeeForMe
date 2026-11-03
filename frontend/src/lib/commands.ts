const NEW_PHOTO_PATTERNS = [
  /\b(nueva|nuevo|otra|otro)\s+(foto|fotografia|imagen)\b/,
  /\b(tomar|toma|sacar|saca|hacer|haz)\s+(una\s+)?(foto|fotografia)\b/,
  /\b(new|another|different)\s+(photo|picture|image)\b/,
  /\b(take|snap)\s+(a\s+)?(photo|picture)\b/,
];

const REPEAT_PATTERNS = [
  /\b(repite|repetir|repiteme|repitelo|otra vez|que dijiste)\b/,
  /\b(repeat|say that again|say it again|once more|what did you say)\b/,
];

const FIND_PATTERNS = [
  /\b(?:encontrar|encuentra|buscar|busca|localizar|localiza)\s+(.+)/,
  /\b(?:find|locate|look for|search for)\s+(.+)/,
];

const MAX_TARGET_LENGTH = 100;

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function isNewPhotoCommand(transcript: string) {
  const text = normalize(transcript);
  return NEW_PHOTO_PATTERNS.some((pattern) => pattern.test(text));
}

export function parseFindCommand(transcript: string): string | null {
  const text = normalize(transcript).replace(/[.,;:!?¿¡]+/g, " ").replace(/\s+/g, " ").trim();
  for (const pattern of FIND_PATTERNS) {
    const target = pattern.exec(text)?.[1]?.trim();
    if (target) return target.slice(0, MAX_TARGET_LENGTH);
  }
  return null;
}

export function isRepeatCommand(transcript: string) {
  const text = normalize(transcript);
  return REPEAT_PATTERNS.some((pattern) => pattern.test(text));
}
