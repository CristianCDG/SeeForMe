"use client";

import { useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { resizeImage } from "@/lib/image";
import { getMessages } from "@/lib/messages";
import { startRecording, type Recording } from "@/lib/recorder";
import { speak, stopSpeaking } from "@/lib/speech";
import { toWav } from "@/lib/wav";

type Status = "idle" | "listening" | "thinking" | "answered" | "error";

const MAX_RECORDING_MS = 20_000;

const subscribe = () => () => {};
const getLanguage = () => navigator.language;
const getServerLanguage = () => "en";

async function transcribe(recording: Blob): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("audio", await toWav(recording), "question.wav");
    const response = await fetch("/api/transcribe", { method: "POST", body: form });
    if (!response.ok) return null;
    const data: { text: string } = await response.json();
    return data.text.trim() || null;
  } catch {
    return null;
  }
}

export default function Assistant() {
  const language = useSyncExternalStore(subscribe, getLanguage, getServerLanguage);
  const messages = getMessages(language);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<Blob | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState("");

  function say(value: string) {
    setText(value);
    return speak(value, language);
  }

  async function describe(question: string) {
    const image = imageRef.current;
    try {
      if (!image) throw new Error("No photo to describe");
      const form = new FormData();
      form.append("image", image, "photo.jpg");
      form.append("question", question);

      const response = await fetch("/api/describe", { method: "POST", body: form });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      const data: { answer: string } = await response.json();
      setStatus("answered");
      say(data.answer);
    } catch {
      setStatus("error");
      say(messages.error);
    }
  }

  async function finishQuestion() {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    window.clearTimeout(timerRef.current);

    setStatus("thinking");
    say(messages.thinking);
    const question = await transcribe(await recording.stop());
    await describe(question ?? messages.defaultQuestion);
  }

  async function beginListening() {
    setStatus("listening");
    await say(messages.askQuestion);
    try {
      recordingRef.current = await startRecording();
      timerRef.current = window.setTimeout(finishQuestion, MAX_RECORDING_MS);
    } catch {
      setStatus("thinking");
      await say(messages.noMicrophone);
      await describe(messages.defaultQuestion);
    }
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      imageRef.current = await resizeImage(file);
    } catch {
      setStatus("error");
      say(messages.error);
      return;
    }
    await beginListening();
  }

  function handleTap() {
    if (status === "thinking") return;
    if (status === "listening") {
      if (recordingRef.current) void finishQuestion();
      else stopSpeaking();
      return;
    }
    stopSpeaking();
    inputRef.current?.click();
  }

  const label =
    status === "answered"
      ? `${text}. ${messages.tapAgain}`
      : status === "idle"
        ? messages.tapToPhoto
        : text;

  return (
    <main className="flex flex-1 flex-col">
      <h1 className="sr-only">SeeForMe</h1>
      <button
        type="button"
        onClick={handleTap}
        aria-label={label}
        aria-busy={status === "thinking"}
        className="flex flex-1 w-full flex-col items-center justify-center gap-6 overflow-y-auto bg-black p-6 text-center text-yellow-300 focus-visible:outline-8 focus-visible:outline-white"
      >
        <span className="text-5xl font-bold">SeeForMe</span>
        <span className="max-w-2xl text-3xl leading-snug">
          {status === "idle" ? messages.tapToPhoto : text}
        </span>
        {status === "listening" && (
          <span className="text-2xl text-red-400" aria-hidden="true">
            ●
          </span>
        )}
        {status === "answered" && (
          <span className="text-2xl text-white">{messages.tapAgain}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
    </main>
  );
}
