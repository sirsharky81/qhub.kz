import { getSendTransfer, recordSendDownload } from "@/lib/send/store";
import { openSendFileStream } from "@/lib/send/storage";
import {
  isHlsPlaylistBody,
  isHlsPlaylistContentType,
  rewriteHlsPlaylist,
  signUrlSegmentToken,
} from "./hls-rewrite";
import { verifyCastStreamToken } from "./proxy-token";
import type { CastSendUpstreamRef, CastStreamTokenPayload, CastUploadUpstreamRef } from "./types";
import { claimCastSendStreamStart, getCastUploadRecord, openCastUploadStream } from "./upload-store";

const FORWARD_REQ = ["range", "if-range"] as const;
const FORWARD_RES = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
] as const;

export async function handleCastStreamRequest(
  token: string,
  request: Request,
  origin: string,
): Promise<Response> {
  const payload = await verifyCastStreamToken(token);
  if (!payload) {
    return Response.json({ error: "Ссылка истекла или недействительна" }, { status: 401 });
  }

  switch (payload.upstreamKind) {
    case "url":
      return streamFromUrl(payload, request, origin);
    case "send":
      return streamFromSend(payload, request);
    case "upload":
      return streamFromUpload(payload, request);
    default:
      return Response.json({ error: "Неизвестный источник" }, { status: 400 });
  }
}

async function streamFromUrl(
  payload: CastStreamTokenPayload,
  request: Request,
  origin: string,
): Promise<Response> {
  const upstreamUrl = payload.upstreamRef as string;
  const headers = new Headers();
  for (const name of FORWARD_REQ) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (payload.referer) headers.set("Referer", payload.referer);
  if (payload.userAgent) headers.set("User-Agent", payload.userAgent);

  const upstream = await fetch(upstreamUrl, { headers, cache: "no-store" });
  if (!upstream.ok) {
    return Response.json({ error: "Upstream недоступен" }, { status: upstream.status });
  }

  const contentType =
    upstream.headers.get("content-type")?.split(";")[0]?.trim() ||
    payload.contentType;

  if (
    isHlsPlaylistContentType(contentType) ||
    (upstreamUrl.split("?")[0]?.toLowerCase().endsWith(".m3u8") ?? false)
  ) {
    const text = await upstream.text();
    if (isHlsPlaylistBody(text)) {
      const rewritten = await rewriteHlsPlaylist(text, upstreamUrl, async (absoluteUrl, ct) => {
        const segToken = await signUrlSegmentToken(absoluteUrl, ct, payload.referer);
        return `${origin.replace(/\/$/, "")}/api/cast/stream/${encodeURIComponent(segToken)}`;
      });
      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "private, max-age=300",
        },
      });
    }
  }

  return proxyResponse(upstream);
}

async function streamFromSend(payload: CastStreamTokenPayload, request: Request): Promise<Response> {
  const ref = payload.upstreamRef as CastSendUpstreamRef;
  const transfer = await getSendTransfer(ref.shareId);
  if (!transfer) {
    return Response.json({ error: "Send-файл недоступен" }, { status: 404 });
  }
  if (transfer.revoked || transfer.expiresAt <= Date.now()) {
    return Response.json({ error: "Send-ссылка истекла" }, { status: 410 });
  }
  // Password was already verified when this token was issued in resolveCastSend —
  // the signed token itself is the proof of authorization for this shareId.

  // Atomic claim: only the first of possibly-concurrent Range requests for this
  // stream token records the Send download, avoiding double-consuming one-time links.
  const claimed = await claimCastSendStreamStart(payload.streamId);
  if (claimed) {
    const recorded = await recordSendDownload(transfer);
    if (!recorded.ok) {
      return Response.json({ error: recorded.reason }, { status: 410 });
    }
  }

  const total = transfer.sizeBytes;
  const parsed = parseByteRange(request.headers.get("range"), total);
  const { stream, sizeBytes } = await openSendFileStream(transfer.filePath, parsed ?? undefined);
  const effectiveTotal = sizeBytes ?? total;

  const headers = new Headers({
    "Content-Type": transfer.mime || payload.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });

  if (parsed && effectiveTotal > 0) {
    headers.set("Content-Range", `bytes ${parsed.start}-${parsed.end}/${effectiveTotal}`);
    headers.set("Content-Length", String(parsed.end - parsed.start + 1));
    return new Response(stream, { status: 206, headers });
  }

  if (effectiveTotal > 0) headers.set("Content-Length", String(effectiveTotal));
  return new Response(stream, { status: 200, headers });
}

async function streamFromUpload(
  payload: CastStreamTokenPayload,
  request: Request,
): Promise<Response> {
  const ref = payload.upstreamRef as CastUploadUpstreamRef;
  const record = await getCastUploadRecord(ref.uploadId);
  if (!record) {
    return Response.json({ error: "Загрузка не найдена" }, { status: 404 });
  }

  const total = record.sizeBytes;
  const parsed = parseByteRange(request.headers.get("range"), total);
  const { stream, sizeBytes } = await openCastUploadStream(record, parsed ?? undefined);

  const headers = new Headers({
    "Content-Type": record.mime || payload.contentType || "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });

  if (parsed && sizeBytes > 0) {
    headers.set("Content-Range", `bytes ${parsed.start}-${parsed.end}/${sizeBytes}`);
    headers.set("Content-Length", String(parsed.end - parsed.start + 1));
    return new Response(stream, { status: 206, headers });
  }

  if (sizeBytes > 0) headers.set("Content-Length", String(sizeBytes));
  return new Response(stream, { status: 200, headers });
}

/** Parse `Range: bytes=start-end` into inclusive bounds. Returns null if absent/invalid. */
function parseByteRange(
  rangeHeader: string | null,
  total: number,
): { start: number; end: number } | null {
  if (!rangeHeader || total <= 0) return null;
  const match = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] !== undefined ? Number(match[2]) : total - 1;
  if (!Number.isFinite(start) || start < 0 || start >= total) return null;
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end: Math.min(end, total - 1) };
}

function proxyResponse(upstream: Response): Response {
  const outHeaders = new Headers();
  for (const name of FORWARD_RES) {
    const value = upstream.headers.get(name);
    if (value) outHeaders.set(name, value);
  }
  if (!outHeaders.has("accept-ranges")) {
    outHeaders.set("accept-ranges", "bytes");
  }
  outHeaders.set("cache-control", "private, max-age=3600");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}
