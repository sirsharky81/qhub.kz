import type { SendExpiryPreset } from "./constants";

export interface SendTransfer {
  shareId: string;
  ownerPhone: string;
  /** Path on storage backend (relative to root). */
  filePath: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  passwordHash: string | null;
  expiresAt: number;
  downloadCount: number;
  /** null = unlimited; 1 = one-time link. */
  maxDownloads: number | null;
  createdAt: number;
  revoked: boolean;
}

export interface SendTransferPublicMeta {
  shareId: string;
  filename: string;
  sizeBytes: number;
  mime: string;
  expiresAt: number;
  hasPassword: boolean;
  oneTime: boolean;
  downloadCount: number;
  expired: boolean;
  revoked: boolean;
}

export interface CreateSendOptions {
  expiry: SendExpiryPreset;
  password?: string | null;
  oneTime?: boolean;
}
