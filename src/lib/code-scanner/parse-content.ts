const DELIMITERS = ["\n", "\t", ";", ",", "|"] as const;

export function splitByDelimiters(text: string): string[] | null {
  for (const delimiter of DELIMITERS) {
    const parts = text
      .split(delimiter)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) return parts;
  }
  return null;
}

export function parseToTable(raw: string): { headers: string[]; rows: string[][] } | null {
  const parts = splitByDelimiters(raw);
  if (!parts) return null;
  return {
    headers: parts.map((_, i) => String(i + 1)),
    rows: [parts],
  };
}

export function tableFromRows(headers: string[], rows: string[][]): {
  headers: string[];
  rows: string[][];
} {
  return { headers, rows };
}

export function tableToMatrix(headers: string[], rows: string[][]): string[][] {
  return [headers, ...rows];
}

const ID_PREFIX_RE =
  /^(INV|ОС|WR|Asset|Barcode)[\s\-_:]*/i;

export function extractIdentifier(raw: string): { identifier: string; remainder: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { identifier: "", remainder: "" };

  const prefixMatch = trimmed.match(ID_PREFIX_RE);
  if (prefixMatch) {
    const afterPrefix = trimmed.slice(prefixMatch[0].length).trim();
    const token = afterPrefix.split(/[\n\t;,|]/)[0]?.trim() ?? afterPrefix;
    if (token) {
      return {
        identifier: `${prefixMatch[1].toUpperCase() === "ОС" ? "ОС" : prefixMatch[1]}${token.match(/^[\-:]/) ? "" : "-"}${token.replace(/^[\-:\s]+/, "")}`.replace(/-+/g, "-").replace(/^-/, ""),
        remainder: trimmed.slice(prefixMatch[0].length + token.length).replace(/^[\n\t;,|\s]+/, ""),
      };
    }
  }

  const numericMatch = trimmed.match(/\b(\d{4,})\b/);
  if (numericMatch) {
    const identifier = numericMatch[1]!;
    const idx = trimmed.indexOf(identifier);
    const remainder = (trimmed.slice(0, idx) + trimmed.slice(idx + identifier.length)).trim();
    return { identifier, remainder: remainder.replace(/^[\n\t;,|\s]+/, "") };
  }

  const firstToken = splitByDelimiters(trimmed)?.[0] ?? trimmed.split(/\s+/)[0] ?? trimmed;
  return {
    identifier: firstToken.trim(),
    remainder: trimmed.slice(firstToken.length).trim(),
  };
}

export function parseInventoryTokens(raw: string): { identifier: string; tokens: string[] } {
  const { identifier, remainder } = extractIdentifier(raw);
  const restParts = remainder ? splitByDelimiters(remainder) ?? [remainder] : [];
  return { identifier, tokens: restParts.map((t) => t.trim()).filter(Boolean) };
}

export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function fuzzyColumnMatch(columnName: string): boolean {
  const n = columnName.toLowerCase();
  const keys = [
    "инв",
    "учет",
    "учёт",
    "номер",
    "asset",
    "barcode",
    "штрих",
    "код",
    "id",
  ];
  return keys.some((k) => n.includes(k));
}

export function formatScanDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU");
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return { date, time };
}

export function nowIso(): string {
  return new Date().toISOString();
}
