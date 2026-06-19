import type { StorageBoxData } from "./types";

interface StorageJsonShape {
  boxNumber?: string;
  name?: string;
  location?: string | string[];
  responsible?: string;
  description?: string;
  comment?: string;
  items?: { name?: string; quantity?: number; comment?: string }[];
}

export function parseStorageContent(raw: string): StorageBoxData | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const json = JSON.parse(trimmed) as StorageJsonShape;
    if (json && typeof json === "object" && (json.boxNumber || json.name)) {
      const location = Array.isArray(json.location)
        ? json.location.filter(Boolean).map(String)
        : json.location
          ? [String(json.location)]
          : json.responsible
            ? [String(json.responsible)]
            : [];
      return {
        type: "storage",
        boxNumber: String(json.boxNumber ?? ""),
        name: String(json.name ?? json.description ?? ""),
        location,
        items: (json.items ?? []).map((item) => ({
          name: String(item.name ?? ""),
          quantity: Math.max(1, Number(item.quantity) || 1),
          comment: String(item.comment ?? ""),
        })),
        comment: String(json.comment ?? ""),
        raw: trimmed,
      };
    }
  } catch {
    /* fall through to text parser */
  }

  if (!/тип:\s*коробка/i.test(trimmed)) return null;

  const lines = trimmed.split(/\r?\n/);
  const data: StorageBoxData = {
    type: "storage",
    boxNumber: "",
    name: "",
    location: [],
    items: [],
    comment: "",
    raw: trimmed,
  };

  let section: "none" | "location" | "items" | "comment" = "none";

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    const nameMatch = l.match(/^название:\s*(.+)$/i);
    if (nameMatch) {
      data.name = nameMatch[1]!.trim();
      section = "none";
      continue;
    }

    const numMatch = l.match(/^номер:\s*(.+)$/i);
    if (numMatch) {
      data.boxNumber = numMatch[1]!.trim();
      section = "none";
      continue;
    }

    if (/^расположение:/i.test(l)) {
      section = "location";
      continue;
    }

    if (/^содержимое:/i.test(l)) {
      section = "items";
      continue;
    }

    if (/^комментарий:/i.test(l)) {
      section = "comment";
      continue;
    }

    if (section === "location") {
      data.location.push(l);
      continue;
    }

    if (section === "items") {
      const itemMatch = l.match(/^\d+\.\s*(.+?)(?:\s+x(\d+))?(?:\s+\((.+)\))?$/i);
      if (itemMatch) {
        data.items.push({
          name: itemMatch[1]!.trim(),
          quantity: Math.max(1, Number(itemMatch[2]) || 1),
          comment: itemMatch[3]?.trim() ?? "",
        });
      }
      continue;
    }

    if (section === "comment") {
      data.comment = data.comment ? `${data.comment}\n${l}` : l;
    }
  }

  if (!data.boxNumber && !data.name) return null;
  return data;
}

export function storageDisplayLabel(data: StorageBoxData): string {
  return data.boxNumber || data.name || "Коробка";
}
