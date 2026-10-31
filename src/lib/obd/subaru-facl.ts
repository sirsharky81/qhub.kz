/**
 * Parser for Subaru SSM4 / Select Monitor ".FACL" custom monitor list files.
 * These live under e.g. `SSM4/SUBARU/EU/Data/PIDGroup/DNOriginal/<groupId>/`.
 *
 * FACL is not encrypted: UTF-16LE text with SSM parameter addresses ($1039, $2001, …)
 * and human-readable labels (often Japanese). SGP UDS DIDs (103D, 1021) are usually
 * not stored here — those belong in the QHub UDS catalog + live calibration.
 */

export interface SubaruFaclEntry {
  /** SSM address without $ prefix, e.g. "1039", "2001" */
  addressHex: string;
  label: string;
}

export interface ParsedSubaruFacl {
  entries: SubaruFaclEntry[];
  rawSegmentCount: number;
}

const SKIP_SEGMENT =
  /InternalCF|\.FAC|PIDGroup|\\Brand\\|^9999$|^Data$|^0\\?$|^XC:\\|^and\\0\\/i;

function extractSegments(utf16: string): string[] {
  return (utf16.match(/[^\x00-\x1f]{2,}/g) ?? []).filter((s) => !SKIP_SEGMENT.test(s));
}

/**
 * Parse one .FACL file buffer (UTF-16 LE on disk).
 */
export function parseSubaruFaclFile(bytes: Buffer | Uint8Array): ParsedSubaruFacl {
  const buf = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  const utf16 = buf.toString("utf16le");
  const segments = extractSegments(utf16);
  const entries: SubaruFaclEntry[] = [];
  const seen = new Set<string>();

  const push = (addressHex: string, label: string) => {
    const cleanAddr = addressHex.toUpperCase().padStart(4, "0").replace(/^0+/, "") || "0";
    const key = `${cleanAddr}:${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ addressHex: cleanAddr, label: label.trim() });
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;

    const dotSlash = seg.match(/^\.\$([0-9A-Fa-f]{3,4})\/(.+)$/);
    if (dotSlash) {
      push(dotSlash[1]!, dotSlash[2]!);
      continue;
    }

    const slash = seg.match(/^\$([0-9A-Fa-f]{3,4})\/(.+)$/);
    if (slash) {
      push(slash[1]!, slash[2]!);
      continue;
    }

    const bare = seg.match(/^\$([0-9A-Fa-f]{3,4})$/);
    if (bare) {
      const prev = segments[i - 1];
      const next = segments[i + 1];
      const labelFromPrev = prev && !prev.includes("$") ? prev : "";
      const labelFromNext = next && !next.startsWith("$") ? next : "";
      push(bare[1]!, labelFromPrev || labelFromNext || "");
    }
  }

  return { entries, rawSegmentCount: segments.length };
}

/** Map 4-digit SSM address to 6-hex A8 request field (legacy Gen4 / some ECM). */
export function ssmAddressToA8Hex(addressHex: string): string {
  const n = Number.parseInt(addressHex.replace(/[^0-9A-Fa-f]/g, ""), 16);
  if (!Number.isFinite(n)) return "000000";
  return n.toString(16).padStart(6, "0").toUpperCase();
}

export interface FaclInventoryItem {
  relativePath: string;
  groupId: string;
  listId: string;
  entryCount: number;
  entries: SubaruFaclEntry[];
}

/**
 * Walk a PIDGroup root (e.g. `.../EU/Data/PIDGroup`) and parse every `.FACL`.
 */
export function inventoryFaclUnderRoot(
  files: { relativePath: string; bytes: Buffer }[],
): FaclInventoryItem[] {
  const out: FaclInventoryItem[] = [];
  for (const file of files) {
    if (!file.relativePath.toLowerCase().endsWith(".facl")) continue;
    const parts = file.relativePath.replace(/\\/g, "/").split("/");
    const fileName = parts[parts.length - 1] ?? "";
    const groupId = parts.length >= 2 ? parts[parts.length - 2]! : "";
    const listId = fileName.replace(/\.facl$/i, "");
    const parsed = parseSubaruFaclFile(file.bytes);
    out.push({
      relativePath: file.relativePath,
      groupId,
      listId,
      entryCount: parsed.entries.length,
      entries: parsed.entries,
    });
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
