import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "crypto";
import { Readable } from "node:stream";
import {
  CAST_STREAM_STARTED_PREFIX,
  CAST_STREAM_TTL_SEC,
  CAST_UPLOAD_REDIS_PREFIX,
  CAST_UPLOAD_TTL_SEC,
} from "./constants";
import { castRedisDel, castRedisGet, castRedisGetJson, castRedisSet, castRedisSetNx } from "./redis";
import type { CastUploadPublicMeta, CastUploadRecord } from "./types";

function uploadKey(uploadId: string): string {
  return `${CAST_UPLOAD_REDIS_PREFIX}${uploadId}`;
}

function getCastLocalRoot(): string {
  return process.env.CAST_LOCAL_ROOT?.trim() || path.join(process.cwd(), ".data", "cast", "uploads");
}

export function buildCastUploadPath(uploadId: string, filename: string): string {
  const safe = path.basename(filename || "video.mp4").replace(/[^\w.\-()+\s]/g, "_").slice(0, 180);
  return path.join(uploadId, safe || "video.mp4");
}

export async function createCastUploadRecord(
  filename: string,
  mime: string,
  sizeBytes: number,
  data: Buffer,
): Promise<CastUploadRecord> {
  const uploadId = randomBytes(12).toString("hex");
  const now = Date.now();
  const expiresAt = now + CAST_UPLOAD_TTL_SEC * 1000;
  const relativePath = buildCastUploadPath(uploadId, filename);
  const absDir = path.join(getCastLocalRoot(), uploadId);
  await mkdir(absDir, { recursive: true });
  const absFile = path.join(getCastLocalRoot(), relativePath);
  await writeFile(absFile, data);

  const record: CastUploadRecord = {
    uploadId,
    filename: path.basename(relativePath),
    mime,
    sizeBytes,
    filePath: relativePath.replace(/\\/g, "/"),
    createdAt: now,
    expiresAt,
  };

  await castRedisSet(uploadKey(uploadId), JSON.stringify(record), CAST_UPLOAD_TTL_SEC);
  return record;
}

export async function getCastUploadRecord(uploadId: string): Promise<CastUploadRecord | null> {
  const id = uploadId.trim();
  if (!id) return null;
  const record = await castRedisGetJson<CastUploadRecord>(uploadKey(id));
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    await purgeCastUpload(record);
    return null;
  }
  return record;
}

export function toCastUploadPublicMeta(record: CastUploadRecord): CastUploadPublicMeta {
  return {
    uploadId: record.uploadId,
    filename: record.filename,
    mime: record.mime,
    sizeBytes: record.sizeBytes,
    expiresAt: record.expiresAt,
  };
}

export async function openCastUploadStream(
  record: CastUploadRecord,
): Promise<{ stream: ReadableStream<Uint8Array>; sizeBytes: number }> {
  const abs = path.join(getCastLocalRoot(), record.filePath);
  const nodeStream = createReadStream(abs);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return { stream: webStream, sizeBytes: record.sizeBytes };
}

export async function purgeCastUpload(record: CastUploadRecord): Promise<void> {
  await castRedisDel(uploadKey(record.uploadId));
  const absDir = path.join(getCastLocalRoot(), record.uploadId);
  await rm(absDir, { force: true, recursive: true }).catch(() => {});
}

export async function markCastSendStreamStarted(streamId: string): Promise<boolean> {
  const key = `${CAST_STREAM_STARTED_PREFIX}${streamId}`;
  return castRedisSetNx(key, "1", CAST_STREAM_TTL_SEC);
}

export async function wasCastSendStreamStarted(streamId: string): Promise<boolean> {
  const key = `${CAST_STREAM_STARTED_PREFIX}${streamId}`;
  const val = await castRedisGet(key);
  return val !== null;
}
