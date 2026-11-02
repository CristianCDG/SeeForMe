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

export function isRepeatCommand(transcript: string) {
  const text = normalize(transcript);
  return REPEAT_PATTERNS.some((pattern) => pattern.test(text));
}
