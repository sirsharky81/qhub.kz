import { hashPassword, verifyPassword } from "@/lib/admin/password";
import {
  REDIS_OWNER_PREFIX,
  REDIS_SHARE_PREFIX,
  SEND_EXPIRY_PRESETS,
  type SendExpiryPreset,
} from "./constants";
import { generateShareId } from "./tokens";
import {
  sendRedisDel,
  sendRedisGet,
  sendRedisGetJson,
  sendRedisSet,
} from "./redis";
import { buildShareFilePath } from "./paths";
import { deleteSendPath, writeSendFile } from "./storage";
import { archiveFiles } from "./archive";
import type { CreateSendOptions, SendTransfer, SendTransferPublicMeta } from "./types";

const MAX_ID_ATTEMPTS = 12;

function shareKey(shareId: string): string {
  return `${REDIS_SHARE_PREFIX}${shareId}`;
}

function ownerKey(phone: string): string {
  return `${REDIS_OWNER_PREFIX}${phone}`;
}

function ttlSeconds(expiresAt: number): number {
  return Math.max(60, Math.ceil((expiresAt - Date.now()) / 1000));
}

export function toPublicMeta(transfer: SendTransfer): SendTransferPublicMeta {
  const now = Date.now();
  return {
    shareId: transfer.shareId,
    filename: transfer.filename,
    sizeBytes: transfer.sizeBytes,
    mime: transfer.mime,
    expiresAt: transfer.expiresAt,
    hasPassword: transfer.passwordHash !== null,
    oneTime: transfer.maxDownloads === 1,
    downloadCount: transfer.downloadCount,
    expired: transfer.expiresAt <= now,
    revoked: transfer.revoked,
  };
}

async function loadOwnerShareIds(phone: string): Promise<string[]> {
  const raw = await sendRedisGet(ownerKey(phone));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as string[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function addOwnerShareId(phone: string, shareId: string, expiresAt: number): Promise<void> {
  const ids = await loadOwnerShareIds(phone);
  if (!ids.includes(shareId)) ids.unshift(shareId);
  const trimmed = ids.slice(0, 100);
  await sendRedisSet(ownerKey(phone), JSON.stringify(trimmed), ttlSeconds(expiresAt));
}

async function removeOwnerShareId(phone: string, shareId: string): Promise<void> {
  const ids = (await loadOwnerShareIds(phone)).filter((id) => id !== shareId);
  if (ids.length === 0) {
    await sendRedisDel(ownerKey(phone));
    return;
  }
  await sendRedisSet(ownerKey(phone), JSON.stringify(ids));
}

async function generateUniqueShareId(): Promise<string> {
  for (let i = 0; i < MAX_ID_ATTEMPTS; i++) {
    const id = generateShareId();
    const existing = await sendRedisGetJson<SendTransfer>(shareKey(id));
    if (!existing) return id;
  }
  throw new Error("Не удалось сгенерировать ссылку");
}

export async function createSendTransfer(
  ownerPhone: string,
  fileBuffers: { name: string; data: Buffer }[],
  options: CreateSendOptions,
): Promise<{ transfer: SendTransfer; urlPath: string }> {
  const preset = options.expiry;
  if (!(preset in SEND_EXPIRY_PRESETS)) {
    throw new Error("Неверный срок хранения");
  }

  const ttlSec = SEND_EXPIRY_PRESETS[preset as SendExpiryPreset];
  const expiresAt = Date.now() + ttlSec * 1000;
  const shareId = await generateUniqueShareId();

  const archived = await archiveFiles(fileBuffers);
  const relativePath = buildShareFilePath(shareId, archived.filename);
  await writeSendFile(relativePath, archived.data);

  const passwordRaw = options.password?.trim();
  const passwordHash = passwordRaw ? await hashPassword(passwordRaw) : null;

  const transfer: SendTransfer = {
    shareId,
    ownerPhone,
    filePath: relativePath,
    filename: archived.filename,
    mime: archived.mime,
    sizeBytes: archived.data.length,
    passwordHash,
    expiresAt,
    downloadCount: 0,
    maxDownloads: options.oneTime ? 1 : null,
    createdAt: Date.now(),
    revoked: false,
  };

  await sendRedisSet(shareKey(shareId), JSON.stringify(transfer), ttlSec);
  await addOwnerShareId(ownerPhone, shareId, expiresAt);

  return { transfer, urlPath: `/s/${shareId}` };
}

export async function getSendTransfer(shareId: string): Promise<SendTransfer | null> {
  const transfer = await sendRedisGetJson<SendTransfer>(shareKey(shareId));
  if (!transfer) return null;
  if (transfer.revoked || transfer.expiresAt <= Date.now()) {
    return transfer;
  }
  return transfer;
}

export async function listOwnerTransfers(ownerPhone: string): Promise<SendTransferPublicMeta[]> {
  const ids = await loadOwnerShareIds(ownerPhone);
  const result: SendTransferPublicMeta[] = [];
  for (const id of ids) {
    const transfer = await getSendTransfer(id);
    if (!transfer || transfer.revoked) continue;
    if (transfer.expiresAt <= Date.now()) {
      await purgeSendTransfer(transfer);
      continue;
    }
    result.push(toPublicMeta(transfer));
  }
  return result;
}

export async function revokeSendTransfer(ownerPhone: string, shareId: string): Promise<boolean> {
  const transfer = await getSendTransfer(shareId);
  if (!transfer || transfer.ownerPhone !== ownerPhone) return false;
  transfer.revoked = true;
  const remaining = ttlSeconds(transfer.expiresAt);
  await sendRedisSet(shareKey(shareId), JSON.stringify(transfer), remaining);
  await deleteSendPath(transfer.filePath);
  await removeOwnerShareId(ownerPhone, shareId);
  return true;
}

export async function purgeSendTransfer(transfer: SendTransfer): Promise<void> {
  await sendRedisDel(shareKey(transfer.shareId));
  await deleteSendPath(transfer.filePath);
  await removeOwnerShareId(transfer.ownerPhone, transfer.shareId);
}

export async function verifySendPassword(transfer: SendTransfer, password: string): Promise<boolean> {
  if (!transfer.passwordHash) return true;
  return verifyPassword(password, transfer.passwordHash);
}

export async function recordSendDownload(
  transfer: SendTransfer,
): Promise<{ ok: true; transfer: SendTransfer } | { ok: false; reason: string }> {
  if (transfer.revoked) return { ok: false, reason: "Ссылка отозвана" };
  if (transfer.expiresAt <= Date.now()) {
    await purgeSendTransfer(transfer);
    return { ok: false, reason: "Ссылка истекла" };
  }
  if (transfer.maxDownloads !== null && transfer.downloadCount >= transfer.maxDownloads) {
    await purgeSendTransfer(transfer);
    return { ok: false, reason: "Ссылка уже использована" };
  }

  const updated: SendTransfer = {
    ...transfer,
    downloadCount: transfer.downloadCount + 1,
  };

  const remaining = ttlSeconds(updated.expiresAt);
  await sendRedisSet(shareKey(updated.shareId), JSON.stringify(updated), remaining);

  if (updated.maxDownloads !== null && updated.downloadCount >= updated.maxDownloads) {
    await deleteSendPath(updated.filePath);
    await sendRedisDel(shareKey(updated.shareId));
    await removeOwnerShareId(updated.ownerPhone, updated.shareId);
  }

  return { ok: true, transfer: updated };
}

export function buildSendPublicUrl(origin: string, shareId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/s/${shareId}`;
}
