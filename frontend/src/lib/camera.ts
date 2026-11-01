import { encodeFrame } from "@/lib/image";

export type Camera = {
  capture: () => Promise<Blob>;
  stop: () => void;
};

export async function startCamera(video: HTMLVideoElement): Promise<Camera> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
    audio: false,
  });

  const stop = () => {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };

  try {
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    stop();
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
