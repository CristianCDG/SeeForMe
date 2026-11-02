import { encodeFrame } from "@/lib/image";

export type Camera = {
  capture: () => Promise<Blob>;
  stop: () => void;
};

let cachedStream: MediaStream | null = null;

async function getStream(): Promise<MediaStream> {
  if (cachedStream?.getTracks().some((track) => track.readyState === "live")) {
    return cachedStream;
  }
  cachedStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
    audio: false,
  });
  return cachedStream;
}

export function releaseCamera() {
  cachedStream?.getTracks().forEach((track) => track.stop());
  cachedStream = null;
}

export async function startCamera(video: HTMLVideoElement): Promise<Camera> {
  const stream = await getStream();

  const stop = () => {
    video.pause();
    video.srcObject = null;
  };

  try {
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    stop();
    releaseCamera();
    throw error;
  }

  return {
    capture: () =>
      video.videoWidth
        ? encodeFrame(video, video.videoWidth, video.videoHeight)
        : Promise.reject(new Error("Camera is not ready")),
    stop,
  };
}
