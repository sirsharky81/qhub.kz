import { NextResponse } from "next/server";
import { handleCorsPreflight, withCors } from "@/lib/api/cors";
import {
  assertParseBodySize,
  enforceEtacsCodingAccess,
  publicEtacsErrorMessage,
} from "@/lib/etacs-coding/guard";

export function etacsJson(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return withCors(NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }), request);
}

export async function etacsPreflight(request: Request): Promise<Response | null> {
  return handleCorsPreflight(request);
}

export async function etacsGuard(request: Request): Promise<Response | null> {
  const preflight = await etacsPreflight(request);
  if (preflight) return preflight;
  return enforceEtacsCodingAccess(request);
}

export function etacsError(request: Request, error: unknown, fallbackStatus = 400): Response {
  const status =
    error instanceof Error && "status" in error && typeof error.status === "number"
      ? error.status
      : fallbackStatus;
  const payload: Record<string, unknown> = { error: publicEtacsErrorMessage(error) };
  if (status === 409 && error instanceof Error && "crcVerified" in error) {
    payload.crcVerified = false;
  }
  return etacsJson(request, payload, status);
}

export function readParseBuffer(body: Buffer): Response | null {
  return assertParseBodySize(body);
}
