import { MAX_DISPLAY_NAME_LENGTH } from "./constants";

export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_DISPLAY_NAME_LENGTH);
}
