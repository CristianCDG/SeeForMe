const SPEECH_TIMEOUT_MS = 8_000;

function synthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  return window.speechSynthesis;
}

export function speak(text: string, language: string): Promise<void> {
  const engine = synthesis();
  if (!engine) return Promise.resolve();
  engine.cancel();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    const timeout = window.setTimeout(resolve, SPEECH_TIMEOUT_MS);
    const finish = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    engine.speak(utterance);
  });
}

export function stopSpeaking() {
  synthesis()?.cancel();
}
