import type { LaunchFileEntry } from "@/lib/music/media-library";

const BATCH_MS = 400;

let pendingEntries: LaunchFileEntry[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function dedupeByHandleName(entries: LaunchFileEntry[]): LaunchFileEntry[] {
  const seen = new Set<string>();
  const unique: LaunchFileEntry[] = [];

  for (const entry of entries) {
    const key = entry.handle.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }

  return unique;
}

export function scheduleLaunchFileImport(
  entries: LaunchFileEntry[],
  onFlush: (entries: LaunchFileEntry[]) => void | Promise<void>,
): void {
  if (entries.length === 0) return;

  pendingEntries.push(...entries);

  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(() => {
    batchTimer = null;
    const batch = dedupeByHandleName(pendingEntries);
    pendingEntries = [];
    void onFlush(batch);
  }, BATCH_MS);
}
