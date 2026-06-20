import { isClientYoutubeExtraction } from "./extraction-config";
import { ExtractClientError } from "./extract-errors";
import {
  fetchAudioStreamServer,
  fetchMetadataServer,
} from "./extract-client-server";
import {
  fetchYoutubeAudioClient,
  fetchYoutubeMetadataClient,
} from "./youtube-browser";
import { validateMvpExtractorUrl } from "./url-validator";
import type { VideoMetadata } from "./types";

export { ExtractClientError } from "./extract-errors";

function mapValidationError(err: unknown): ExtractClientError {
  const code = err instanceof Error ? err.message : "invalid_url";
  if (code === "unsupported_platform") {
    return new ExtractClientError("Поддерживаются только ссылки YouTube", 400);
  }
  if (code === "invalid_protocol" || code === "invalid_url") {
    return new ExtractClientError("Некорректная ссылка", 400);
  }
  return new ExtractClientError("Некорректная ссылка", 400);
}

export async function fetchMetadata(url: string): Promise<VideoMetadata> {
  let normalized: string;
  try {
    normalized = validateMvpExtractorUrl(url).url;
  } catch (err) {
    throw mapValidationError(err);
  }

  if (isClientYoutubeExtraction()) {
    return fetchYoutubeMetadataClient(normalized);
  }
  return fetchMetadataServer(normalized);
}

export async function fetchAudioStream(
  url: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Blob> {
  let normalized: string;
  try {
    normalized = validateMvpExtractorUrl(url).url;
  } catch (err) {
    throw mapValidationError(err);
  }

  if (isClientYoutubeExtraction()) {
    return fetchYoutubeAudioClient(normalized, onProgress);
  }
  return fetchAudioStreamServer(normalized, onProgress);
}
