"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { releaseCamera, startCamera, type Camera } from "@/lib/camera";
import { isNewPhotoCommand, isRepeatCommand, parseFindCommand } from "@/lib/commands";
import { getDebugLines, getServerDebugLines, subscribeDebug } from "@/lib/debug";
import { resizeImage } from "@/lib/image";
import { getMessages } from "@/lib/messages";
import { startRecording, type Recording } from "@/lib/recorder";
import { speak, stopSpeaking, unlockSpeech } from "@/lib/speech";
import { keepAwake } from "@/lib/wakeLock";
import { toWav } from "@/lib/wav";

type Status = "idle" | "starting" | "aiming" | "searching" | "listening" | "thinking" | "answered" | "error";
type Turn = { question: string; answer: string };
type Mode = "question" | "followUp";

const MAX_RECORDING_MS = 20_000;
const AIM_DELAY_MS = 4_000;
const MAX_IDLE_LISTENS = 15;
const MAX_RETAKES = 2;
const MAX_SEARCH_ATTEMPTS = 8;
const SEARCH_SETTLE_MS = 1_500;

const subscribe = () => () => {};
const getLanguage = () => {
  const requested = new URLSearchParams(window.location.search).get("lang");
  return requested && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(requested) ? requested : navigator.language;
};
const getServerLanguage = () => "en";
const getDebugEnabled = () => new URLSearchParams(window.location.search).has("debug");
const getServerDebugEnabled = () => false;

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

type LocateResult = { found: boolean; guidance: string };

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function locate(photo: Blob, target: string): Promise<LocateResult | "busy" | null> {
  try {
    const form = new FormData();
    form.append("image", photo, "frame.jpg");
    form.append("target", target);
    const response = await fetch("/api/locate", { method: "POST", body: form });
    if (response.status === 429) return "busy";
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default function Assistant() {
  const language = useSyncExternalStore(subscribe, getLanguage, getServerLanguage);
  const messages = getMessages(language);
  const debugEnabled = useSyncExternalStore(subscribe, getDebugEnabled, getServerDebugEnabled);
  const debugLines = useSyncExternalStore(subscribeDebug, getDebugLines, getServerDebugLines);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const cameraFailedRef = useRef(false);
  const imageRef = useRef<Blob | null>(null);
  const historyRef = useRef<Turn[]>([]);
  const recordingRef = useRef<Recording | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const aimTimerRef = useRef<number | undefined>(undefined);
  const modeRef = useRef<Mode>("question");
  const turnRef = useRef(0);
  const idleListensRef = useRef(0);
  const retakesRef = useRef(0);
  const pendingQuestionRef = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function say(value: string) {
    setText(value);
    return speak(value, language);
  }

  function cancelRecording() {
    const recording = recordingRef.current;
    recordingRef.current = null;
    window.clearTimeout(timerRef.current);
    void recording?.stop();
  }

  function interrupt() {
    stopSpeaking();
    cancelRecording();
    window.clearTimeout(aimTimerRef.current);
    turnRef.current += 1;
  }

  async function describe(question: string) {
    const image = imageRef.current;
    const turn = turnRef.current;
    try {
      if (!image) throw new Error("No photo to describe");
      const form = new FormData();
      form.append("image", image, "photo.jpg");
      form.append("question", question);
      form.append("history", JSON.stringify(historyRef.current));
      form.append("allow_retake", retakesRef.current < MAX_RETAKES ? "true" : "false");

      const response = await fetch("/api/describe", { method: "POST", body: form });
      if (response.status === 429) {
        await recover(messages.busy, turn);
        return;
      }
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      const data: { answer: string; retake?: boolean } = await response.json();
      if (data.retake) {
        retakesRef.current += 1;
        pendingQuestionRef.current = question;
        await say(data.answer);
        if (turnRef.current !== turn) return;
        takeNewPhoto();
        return;
      }
      retakesRef.current = 0;
      historyRef.current = [...historyRef.current, { question, answer: data.answer }];
      idleListensRef.current = 0;
      setAnswer(data.answer);
      setStatus("answered");
      await speak(data.answer, language);
      if (turnRef.current !== turn) return;
      await speak(messages.followUpPrompt, language);
      if (turnRef.current !== turn) return;
      await listen("followUp");
    } catch {
      await recover(messages.error, turn);
    }
  }

  async function recover(message: string, turn: number) {
    pendingQuestionRef.current = null;
    setStatus("error");
    await say(message);
    if (turnRef.current !== turn) return;
    await listen("followUp");
  }

  async function afterPhoto() {
    const pending = pendingQuestionRef.current;
    if (pending) {
      pendingQuestionRef.current = null;
      await describe(pending);
      return;
    }
    await beginListening("question");
  }

  function restingStatus(): Status {
    return historyRef.current.length > 0 ? "answered" : "error";
  }

  async function repeatLastAnswer(last: Turn) {
    const turn = turnRef.current;
    setAnswer(last.answer);
    setStatus("answered");
    await speak(last.answer, language);
    if (turnRef.current !== turn) return;
    await listen("followUp");
  }

  async function startSearch(target: string) {
    const video = videoRef.current;
    if (!video) return;
    interrupt();
    keepAwake();
    const turn = turnRef.current;
    setText("");
    setStatus("starting");

    let camera: Camera;
    try {
      camera = await startCamera(video);
    } catch {
      await recover(messages.error, turn);
      return;
    }

    try {
      setStatus("searching");
      await say(messages.searching);
      for (let attempt = 0; attempt < MAX_SEARCH_ATTEMPTS; attempt++) {
        if (turnRef.current !== turn) return;
        await wait(SEARCH_SETTLE_MS);
        if (turnRef.current !== turn) return;

        const photo = await camera.capture();
        const result = await locate(photo, target);
        if (turnRef.current !== turn) return;
        if (result === "busy") {
          await recover(messages.busy, turn);
          return;
        }
        if (!result) {
          await recover(messages.error, turn);
          return;
        }

        const guidance = result.guidance || (result.found ? messages.foundIt : messages.keepSearching);
        if (result.found) {
          imageRef.current = photo;
          historyRef.current = [{ question: target, answer: guidance }];
          retakesRef.current = 0;
          idleListensRef.current = 0;
          setAnswer(guidance);
          setStatus("answered");
          await speak(guidance, language);
          if (turnRef.current !== turn) return;
          await listen("followUp");
          return;
        }
        await say(guidance);
      }

      if (turnRef.current !== turn) return;
      setStatus(restingStatus());
      await speak(messages.notFound, language);
      if (turnRef.current !== turn) return;
      await listen("followUp");
    } catch {
      await recover(messages.error, turn);
    } finally {
      camera.stop();
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

    const target = question ? parseFindCommand(question) : null;
    if (target) {
      await startSearch(target);
      return;
    }

    if (modeRef.current === "followUp") {
      if (!question) {
        setStatus(restingStatus());
        await listen("followUp");
        return;
      }
      if (isNewPhotoCommand(question) || !imageRef.current) {
        takeNewPhoto();
        return;
      }
      const last = historyRef.current.at(-1);
      if (last && isRepeatCommand(question)) {
        await repeatLastAnswer(last);
        return;
      }
      idleListensRef.current = 0;
    }
    await describe(question ?? messages.defaultQuestion);
  }

  async function handleNoSpeech() {
    if (modeRef.current === "question") {
      void finishQuestion();
      return;
    }
    cancelRecording();
    setStatus(restingStatus());
    idleListensRef.current += 1;
    if (idleListensRef.current > MAX_IDLE_LISTENS) {
      releaseCamera();
      await speak(messages.sleeping, language);
      return;
    }
    await listen("followUp");
  }

  async function listen(mode: Mode) {
    const turn = turnRef.current;
    modeRef.current = mode;
    try {
      const recording = await startRecording({
        onSilence: () => void finishQuestion(),
        onNoSpeech: () => void handleNoSpeech(),
      });
      if (turnRef.current !== turn) {
        void recording.stop();
        return;
      }
      recordingRef.current = recording;
      timerRef.current = window.setTimeout(finishQuestion, MAX_RECORDING_MS);
    } catch {
      if (mode === "followUp") {
        setStatus(restingStatus());
        return;
      }
      setStatus("thinking");
      await say(messages.noMicrophone);
      await describe(messages.defaultQuestion);
    }
  }

  async function beginListening(mode: Mode) {
    const turn = turnRef.current;
    setStatus("listening");
    await say(messages.askQuestion);
    if (turnRef.current !== turn) return;
    await listen(mode);
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      imageRef.current = await resizeImage(file);
      historyRef.current = [];
    } catch {
      await recover(messages.photoError, turnRef.current);
      return;
    }
    await afterPhoto();
  }

  async function openCamera() {
    const video = videoRef.current;
    if (!video) return;
    setText("");
    setStatus("starting");
    const turn = turnRef.current;
    let camera: Camera;
    try {
      camera = await startCamera(video);
    } catch {
      cameraFailedRef.current = true;
      pendingQuestionRef.current = null;
      setStatus("error");
      say(messages.noCamera);
      return;
    }
    cameraRef.current = camera;
    setStatus("aiming");
    await say(messages.aimCamera);
    if (turnRef.current !== turn) return;
    aimTimerRef.current = window.setTimeout(() => {
      if (cameraRef.current === camera) void capturePhoto();
    }, AIM_DELAY_MS);
  }

  async function capturePhoto() {
    const camera = cameraRef.current;
    if (!camera) return;
    cameraRef.current = null;
    window.clearTimeout(aimTimerRef.current);
    try {
      imageRef.current = await camera.capture();
      historyRef.current = [];
    } catch {
      camera.stop();
      await recover(messages.photoError, turnRef.current);
      return;
    }
    camera.stop();
    await afterPhoto();
  }

  function takeNewPhoto() {
    unlockSpeech();
    interrupt();
    keepAwake();
    if (cameraFailedRef.current || !navigator.mediaDevices?.getUserMedia) {
      inputRef.current?.click();
      return;
    }
    void openCamera();
  }

  function askAnother() {
    interrupt();
    void beginListening("followUp");
  }

  function handleTap() {
    unlockSpeech();
    if (status === "thinking" || status === "starting") return;
    if (status === "searching") {
      interrupt();
      setStatus(restingStatus());
      void listen("followUp");
      return;
    }
    if (status === "aiming") {
      void capturePhoto();
      return;
    }
    if (status === "listening") {
      if (recordingRef.current) void finishQuestion();
      else stopSpeaking();
      return;
    }
    takeNewPhoto();
  }

  return (
    <main className="relative flex flex-1 flex-col bg-black">
      <h1 className="sr-only">SeeForMe</h1>
      <video
        ref={videoRef}
        playsInline
        muted
        tabIndex={-1}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${status === "aiming" || status === "searching" ? "" : "opacity-0"}`}
      />
      {status === "answered" ? (
        <>
          <p className="flex flex-1 basis-1/3 items-center justify-center overflow-y-auto p-6 text-center text-3xl leading-snug text-yellow-300">
            {answer}
          </p>
          <button
            type="button"
            onClick={askAnother}
            className="flex-1 bg-yellow-300 p-6 text-3xl font-bold text-black focus-visible:outline-8 focus-visible:outline-white"
          >
            {messages.askAnother}
          </button>
          <button
            type="button"
            onClick={takeNewPhoto}
            className="flex-1 bg-white p-6 text-3xl font-bold text-black focus-visible:outline-8 focus-visible:outline-yellow-300"
          >
            {messages.newPhoto}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleTap}
          aria-busy={status === "thinking" || status === "starting"}
          className={`relative flex flex-1 w-full flex-col items-center justify-center gap-6 overflow-y-auto p-6 text-center text-yellow-300 focus-visible:outline-8 focus-visible:outline-white ${status === "aiming" || status === "searching" ? "bg-black/60" : "bg-black"}`}
        >
          <span className="text-5xl font-bold">SeeForMe</span>
          <span className="max-w-2xl text-3xl leading-snug">
            {status === "idle" ? messages.tapToPhoto : text}
          </span>
          {status === "idle" && (
            <span className="max-w-xl text-2xl leading-snug text-white">{messages.intro}</span>
          )}
          {status === "listening" && (
            <span className="text-2xl text-red-400" aria-hidden="true">
              ●
            </span>
          )}
        </button>
      )}
      {debugEnabled && (
        <pre
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 max-h-1/3 overflow-hidden bg-white p-2 text-xs text-black"
        >
          {debugLines.join("\n")}
        </pre>
      )}
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
