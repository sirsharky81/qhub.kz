export type CastUpstreamKind = "url" | "send" | "upload";

export interface CastSendUpstreamRef {
  shareId: string;
  passwordHash?: string;
}

export interface CastUploadUpstreamRef {
  uploadId: string;
}

export type CastUpstreamRef = string | CastSendUpstreamRef | CastUploadUpstreamRef;

export interface CastStreamTokenPayload {
  upstreamKind: CastUpstreamKind;
  upstreamRef: CastUpstreamRef;
  contentType: string;
  title?: string;
  referer?: string;
  userAgent?: string;
  exp: number;
  /** Unique id for one-time send download tracking. */
  streamId: string;
}

export interface CastResolvedMedia {
  title: string;
  poster?: string;
  streamUrl: string;
  contentType: string;
  durationSec?: number;
  source: CastUpstreamKind;
  warnings?: string[];
}

export interface CastUploadRecord {
  uploadId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  filePath: string;
  createdAt: number;
  expiresAt: number;
}

export interface CastUploadPublicMeta {
  uploadId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  expiresAt: number;
}
