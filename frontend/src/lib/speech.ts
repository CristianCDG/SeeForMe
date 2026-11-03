import { logDebug } from "@/lib/debug";

const MIN_SPEECH_TIMEOUT_MS = 8_000;
const SPEECH_MS_PER_CHARACTER = 120;
const VOICES_WAIT_MS = 1_000;
const START_WAIT_MS = 2_000;

function synthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  return window.speechSynthesis;
}

function normalizeLanguage(language: string) {
  return language.replace("_", "-").toLowerCase();
}

function loadVoices(engine: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const voices = engine.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);

  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      engine.removeEventListener("voiceschanged", done);
      resolve(engine.getVoices());
    };
    const timer = window.setTimeout(done, VOICES_WAIT_MS);
    engine.addEventListener("voiceschanged", done);
  });
}

function pickVoice(voices: SpeechSynthesisVoice[], language: string) {
  const wanted = normalizeLanguage(language);
  const base = wanted.slice(0, 2);
  return (
    voices.find((voice) => normalizeLanguage(voice.lang) === wanted) ??
    voices.find((voice) => normalizeLanguage(voice.lang).startsWith(base))
  );
}

export async function speak(text: string, language: string): Promise<void> {
  const engine = synthesis();
  if (!engine) return;
  if (engine.speaking || engine.pending) engine.cancel();
  engine.resume();

  const voices = await loadVoices(engine);
  const voice = pickVoice(voices, language);
  logDebug(`speak "${text.slice(0, 24)}" lang=${language} voices=${voices.length} voice=${voice?.name ?? "none"}`);

  return new Promise((resolve) => {
    let current: SpeechSynthesisUtterance | null = null;
    let started = false;
    let done = false;

    const timeout = window.setTimeout(() => {
      logDebug("speech timeout");
      finish();
    }, Math.max(MIN_SPEECH_TIMEOUT_MS, text.length * SPEECH_MS_PER_CHARACTER));

    function finish() {
      done = true;
      window.clearTimeout(timeout);
      resolve();
    }

    function run(selected: SpeechSynthesisVoice | undefined) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selected ? selected.lang : language;
      if (selected) utterance.voice = selected;
      current = utterance;
      utterance.onstart = () => {
        started = true;
        logDebug("speech start");
      };
      utterance.onend = () => {
        if (current !== utterance) return;
        logDebug("speech end");
        finish();
      };
      utterance.onerror = (event) => {
        if (current !== utterance) return;
        logDebug(`speech error ${event.error}`);
        finish();
      };
      engine!.speak(utterance);

      if (selected) {
        window.setTimeout(() => {
          if (started || done) return;
          logDebug("no start, retrying with default voice");
          engine!.cancel();
          run(undefined);
        }, START_WAIT_MS);
      }
    }

    run(voice);
  });
}

export function unlockSpeech() {
  const engine = synthesis();
  if (!engine) return;
  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.volume = 0;
  engine.speak(utterance);
}

export function stopSpeaking() {
  synthesis()?.cancel();
}
