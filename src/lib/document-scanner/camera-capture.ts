/** Max dimension for perspective-corrected crop output (preserve text detail). */
export { CROP_OUTPUT_MAX_PX } from "./constants";

import { getCameraStream } from "@/lib/platform/camera-access";

export async function openCameraStream(): Promise<MediaStream> {
  const stream = await getCameraStream();

  const track = stream.getVideoTracks()[0];
  if (track) {
    await applyMaxVideoConstraints(track);
  }

  return stream;
}

async function applyMaxVideoConstraints(track: MediaStreamTrack): Promise<void> {
  const caps = track.getCapabilities?.() as (MediaTrackCapabilities & {
    focusMode?: string[];
  }) | undefined;
  if (!caps) return;

  const constraints: MediaTrackConstraints & { focusMode?: string } = {};
  if (caps.width?.max) constraints.width = { ideal: caps.width.max };
  if (caps.height?.max) constraints.height = { ideal: caps.height.max };
  if (caps.focusMode?.includes("continuous")) {
    constraints.focusMode = "continuous";
  }

  if (Object.keys(constraints).length === 0) return;

  try {
    await track.applyConstraints(constraints);
  } catch {
    // Device may reject max resolution — keep default stream.
  }
}

export function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("resize", done);
        resolve();
      }
    };
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("resize", done);
  });
}

/**
 * Capture a still photo at the highest resolution the device allows.
 * Prefers ImageCapture.takePhoto() (full sensor on iOS) over video frame grab.
 */
export async function captureHighResPhoto(
  stream: MediaStream,
  video: HTMLVideoElement,
): Promise<Blob> {
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("No video track");

  if (typeof ImageCapture !== "undefined") {
    try {
      const ic = new ImageCapture(track);
      const settings: PhotoSettings = {};

      if (ic.getPhotoCapabilities) {
        const caps = await ic.getPhotoCapabilities();
        if (caps.imageWidth?.max) settings.imageWidth = caps.imageWidth.max;
        if (caps.imageHeight?.max) settings.imageHeight = caps.imageHeight.max;
      }

      const blob = await ic.takePhoto(Object.keys(settings).length > 0 ? settings : undefined);
      if (blob.size > 0) return blob;
    } catch {
      // Fall back to canvas capture from the video stream.
    }
  }

  await waitForVideoReady(video);
  if (video.videoWidth === 0) throw new Error("Video not ready");

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.97,
    );
  });
}
