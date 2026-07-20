import type { TrackPoint } from "./gpx";

const BUFFER_KEY = "qhub_kz_maps_recording_buffer";

function readRaw(): TrackPoint[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackPoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(points: TrackPoint[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(BUFFER_KEY, JSON.stringify(points));
}

export function clearRecordingBuffer(): void {
  writeRaw([]);
}

export function readRecordingBuffer(): TrackPoint[] {
  return readRaw();
}

export function appendRecordingBuffer(point: TrackPoint): TrackPoint[] {
  const next = [...readRaw(), point];
  writeRaw(next);
  return next;
}

export function replaceRecordingBuffer(points: TrackPoint[]): void {
  writeRaw(points);
}
