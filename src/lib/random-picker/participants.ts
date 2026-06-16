export const MAX_PARTICIPANTS = 10_000;
export const PERFORMANCE_WARN_THRESHOLD = 5_000;

export interface DuplicateInfo {
  name: string;
  count: number;
}

export interface ParseResult {
  participants: string[];
  truncated: boolean;
}

export function parseParticipantsWithLimit(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= MAX_PARTICIPANTS) {
    return { participants: lines, truncated: false };
  }
  return { participants: lines.slice(0, MAX_PARTICIPANTS), truncated: true };
}

export function parseParticipants(text: string): string[] {
  return parseParticipantsWithLimit(text).participants;
}

export function findDuplicates(names: readonly string[]): DuplicateInfo[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function dedupeParticipants(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function formatDuplicateWarning(duplicates: DuplicateInfo[]): string {
  const parts = duplicates.map((d) => `${d.name} (${d.count} раза)`);
  return `Обнаружены дублирующиеся записи: ${parts.join(", ")}.`;
}
