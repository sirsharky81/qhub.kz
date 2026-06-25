import { MAX_VIDEO_BLOB_BYTES } from "./constants";

/** Best-effort shrink for video blobs over the limit (re-encode at lower resolution). */
export async function compressVideoIfNeeded(blob: Blob): Promise<Blob> {
  if (blob.size <= MAX_VIDEO_BLOB_BYTES) return blob;
  if (typeof document === "undefined") return blob;

  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    });

    const maxW = 480;
    const scale = Math.min(1, maxW / Math.max(video.videoWidth, 1));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const stream = canvas.captureStream(15);
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    const combined = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

    const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 400_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.start(200);
      video.play();
      const draw = () => {
        if (video.ended || video.paused) return;
        ctx.drawImage(video, 0, 0, w, h);
        requestAnimationFrame(draw);
      };
      draw();
      video.onended = () => {
        recorder.stop();
        audioCtx.close();
      };
      setTimeout(() => {
        if (recorder.state === "recording") {
          video.pause();
          recorder.stop();
          audioCtx.close();
        }
      }, Math.min(video.duration * 1000 + 500, 65_000));
    });

    const out = new Blob(chunks, { type: mime });
    return out.size <= MAX_VIDEO_BLOB_BYTES ? out : blob;
  } catch {
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
