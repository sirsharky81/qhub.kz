import type { EventInfo, PickerMode, ResultTable, VerificationRecord } from "./types";
import { generateSeed } from "./crypto";

export async function computeVerificationHash(
  timestamp: string,
  eventName: string,
  participants: readonly string[],
  seed: string,
  result: string,
): Promise<string> {
  const participantsStr = participants.join(",");
  const data = timestamp + eventName + participantsStr + seed + result;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

function formatDateParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return { date, time };
}

export async function createVerificationRecord(
  mode: PickerMode,
  event: EventInfo,
  participants: readonly string[],
  result: string,
  keyColumn?: string,
  resultTable?: ResultTable,
): Promise<VerificationRecord> {
  const timestamp = new Date().toISOString();
  const { date, time } = formatDateParts(timestamp);
  const seed = await generateSeed();
  const verificationHash = await computeVerificationHash(
    timestamp,
    event.eventName,
    participants,
    seed,
    result,
  );
  return {
    id: crypto.randomUUID(),
    timestamp,
    date,
    time,
    eventName: event.eventName,
    description: event.description,
    contact: event.contact,
    participantCount: participants.length,
    participants: [...participants],
    result,
    resultTable,
    seed,
    verificationHash,
    mode,
    keyColumn,
  };
}

export async function createNumberHistoryEntry(
  min: number,
  max: number,
  value: number,
): Promise<import("./types").NumberHistoryEntry> {
  const timestamp = new Date().toISOString();
  const { date, time } = formatDateParts(timestamp);
  const seed = await generateSeed();
  const data = `${timestamp}NUMBER_GENERATOR${min}${max}${seed}${value}`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  const verificationHash = Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    id: crypto.randomUUID(),
    value,
    min,
    max,
    timestamp,
    date,
    time,
    seed,
    verificationHash,
  };
}
