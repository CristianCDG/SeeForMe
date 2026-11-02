const SPEECH_LEVEL = 0.02;
const SILENCE_MS = 1_500;
const NO_SPEECH_MS = 8_000;
const POLL_MS = 100;

export type Recording = {
  stop: () => Promise<Blob>;
};

export type RecordingHandlers = {
  onSilence: () => void;
  onNoSpeech: () => void;
};

let cachedStream: MediaStream | null = null;

async function getMicrophone(): Promise<MediaStream> {
  if (cachedStream?.getTracks().some((track) => track.readyState === "live")) {
    return cachedStream;
  }
  cachedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return cachedStream;
}

export function releaseMicrophone() {
  cachedStream?.getTracks().forEach((track) => track.stop());
  cachedStream = null;
}

export async function startRecording(handlers: RecordingHandlers): Promise<Recording> {
  const stream = await getMicrophone();
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  const context = new AudioContext();
  void context.resume();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const startedAt = performance.now();
  let lastLoudAt = startedAt;
  let heardSpeech = false;

  const watcher = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const level = Math.sqrt(sum / samples.length);
    const now = performance.now();

    if (level > SPEECH_LEVEL) {
      heardSpeech = true;
      lastLoudAt = now;
    } else if (heardSpeech && now - lastLoudAt > SILENCE_MS) {
      window.clearInterval(watcher);
      handlers.onSilence();
    } else if (!heardSpeech && now - startedAt > NO_SPEECH_MS) {
      window.clearInterval(watcher);
      handlers.onNoSpeech();
    }
  }, POLL_MS);

  return {
    stop: () =>
      new Promise((resolve) => {
        window.clearInterval(watcher);
        void context.close();
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType }));
        };
        recorder.stop();
      }),
  };
}
