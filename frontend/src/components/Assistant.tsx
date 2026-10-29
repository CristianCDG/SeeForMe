"use client";

import { useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { resizeImage } from "@/lib/image";
import { getMessages } from "@/lib/messages";
import { speak, stopSpeaking } from "@/lib/speech";

type Status = "idle" | "thinking" | "answered" | "error";

const subscribe = () => () => {};
const getLanguage = () => navigator.language;
const getServerLanguage = () => "en";

export default function Assistant() {
  const language = useSyncExternalStore(subscribe, getLanguage, getServerLanguage);
  const messages = getMessages(language);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState("");

  function say(value: string) {
    setText(value);
    speak(value, language);
  }

  function openCamera() {
    if (status === "thinking") return;
    stopSpeaking();
    inputRef.current?.click();
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setStatus("thinking");
    say(messages.thinking);

    try {
      const image = await resizeImage(file);
      const form = new FormData();
      form.append("image", image, "photo.jpg");
      form.append("question", messages.defaultQuestion);

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
        onClick={openCamera}
        aria-label={label}
        aria-busy={status === "thinking"}
        className="flex flex-1 w-full flex-col items-center justify-center gap-6 overflow-y-auto bg-black p-6 text-center text-yellow-300 focus-visible:outline-8 focus-visible:outline-white"
      >
        <span className="text-5xl font-bold">SeeForMe</span>
        <span className="max-w-2xl text-3xl leading-snug">
          {status === "idle" ? messages.tapToPhoto : text}
        </span>
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
