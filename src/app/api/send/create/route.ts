import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/messenger/guard";
import { assertSendAccess } from "@/lib/send/access";
import { getSendMaxBytes, isSendStorageConfigured } from "@/lib/send/config";
import type { SendExpiryPreset } from "@/lib/send/constants";
import { SEND_EXPIRY_PRESETS } from "@/lib/send/constants";
import { createSendTransfer, buildSendPublicUrl } from "@/lib/send/store";
import { getPublicOrigin } from "@/lib/public-origin";
import {
  checkSendRateLimit,
  checkSendUploadRateLimit,
  getClientIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

const VALID_EXPIRY = new Set<string>(Object.keys(SEND_EXPIRY_PRESETS));

export async function POST(request: Request) {
  try {
    if (!isSendStorageConfigured()) {
      return NextResponse.json({ error: "QHub Send не настроен" }, { status: 503 });
    }

    const { phone } = await assertSendAccess();

    const ip = getClientIp(request);
    const general = await checkSendRateLimit(`${phone}:${ip}`);
    if (!general.allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        {
          status: 429,
          headers: general.retryAfterSec
            ? { "Retry-After": String(general.retryAfterSec) }
            : undefined,
        },
      );
    }

    const uploadLimit = await checkSendUploadRateLimit(phone);
    if (!uploadLimit.allowed) {
      return NextResponse.json(
        { error: "Лимит загрузок исчерпан" },
        {
          status: 429,
          headers: uploadLimit.retryAfterSec
            ? { "Retry-After": String(uploadLimit.retryAfterSec) }
            : undefined,
        },
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    const maxBytes = getSendMaxBytes();
    if (contentLength > maxBytes) {
      return NextResponse.json({ error: "Файл слишком большой" }, { status: 413 });
    }

    const form = await request.formData();
    const expiryRaw = String(form.get("expiry") ?? "1d");
    const expiry = VALID_EXPIRY.has(expiryRaw) ? (expiryRaw as SendExpiryPreset) : "1d";
    const password = form.get("password");
    const oneTime = form.get("oneTime") === "1" || form.get("oneTime") === "true";

    const entries = form.getAll("files");
    const fileBuffers: { name: string; data: Buffer }[] = [];
    let totalBytes = 0;

    for (const entry of entries) {
      if (!(entry instanceof File) || entry.size === 0) continue;
      totalBytes += entry.size;
      if (totalBytes > maxBytes) {
        return NextResponse.json({ error: "Суммарный размер файлов слишком большой" }, { status: 413 });
      }
      const data = Buffer.from(await entry.arrayBuffer());
      fileBuffers.push({ name: entry.name || "file", data });
    }

    if (fileBuffers.length === 0) {
      return NextResponse.json({ error: "Выберите хотя бы один файл" }, { status: 400 });
    }

    const { transfer, urlPath } = await createSendTransfer(phone, fileBuffers, {
      expiry,
      password: typeof password === "string" ? password : null,
      oneTime,
    });

    const origin = getPublicOrigin(request);
    const url = buildSendPublicUrl(origin, transfer.shareId);

    return NextResponse.json({
      ok: true,
      shareId: transfer.shareId,
      url,
      urlPath,
      filename: transfer.filename,
      sizeBytes: transfer.sizeBytes,
      expiresAt: transfer.expiresAt,
      hasPassword: transfer.passwordHash !== null,
      oneTime: transfer.maxDownloads === 1,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
