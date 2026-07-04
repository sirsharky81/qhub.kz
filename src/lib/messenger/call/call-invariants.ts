import type { CallPhase, TransportPhase } from "./types";

export interface CallInvariantContext {
  phase: CallPhase;
  callId: string | null;
  hasPeerConnection: boolean;
  hasLocalStream: boolean;
  hasRemoteTrack: boolean;
  hasPolling: boolean;
  transportPhase: TransportPhase;
}

export function checkCallInvariants(ctx: CallInvariantContext): string[] {
  const violations: string[] = [];

  if (ctx.phase === "idle") {
    if (ctx.callId) violations.push("idle: callId должен быть null");
    if (ctx.hasPeerConnection) violations.push("idle: peerConnection должен быть null");
    if (ctx.hasLocalStream) violations.push("idle: localStream должен быть null");
    if (ctx.hasPolling) violations.push("idle: polling должен быть остановлен");
  }

  if (ctx.phase === "outgoing" || ctx.phase === "incoming") {
    if (!ctx.callId) violations.push(`${ctx.phase}: callId обязателен`);
  }

  if (ctx.phase === "connecting") {
    if (!ctx.callId) violations.push("connecting: callId обязателен");
    if (!ctx.hasPeerConnection) violations.push("connecting: peerConnection обязателен");
    if (!ctx.hasLocalStream) violations.push("connecting: localStream обязателен");
  }

  if (ctx.phase === "active") {
    if (!ctx.callId) violations.push("active: callId обязателен");
    if (!ctx.hasPeerConnection) violations.push("active: peerConnection обязателен");
    if (!ctx.hasLocalStream) violations.push("active: localStream обязателен");
    if (!ctx.hasRemoteTrack) violations.push("active: нет remote audio track");
  }

  if (ctx.phase === "ended") {
    if (ctx.hasPeerConnection) violations.push("ended: peerConnection должен быть освобожден");
    if (ctx.hasLocalStream) violations.push("ended: localStream должен быть освобожден");
  }

  return violations;
}
