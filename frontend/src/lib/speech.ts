function synthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  return window.speechSynthesis;
}

export function speak(text: string, language: string) {
  const engine = synthesis();
  if (!engine) return;
  engine.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  engine.speak(utterance);
}

export function stopSpeaking() {
  synthesis()?.cancel();
}
