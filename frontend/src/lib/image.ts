const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.85;

export function encodeFrame(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Canvas is not available"));
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return await encodeFrame(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
