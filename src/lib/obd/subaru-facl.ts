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

    const slashOrColon = seg.match(/\$([0-9A-Fa-f]{2,4})[/:](.+)$/);
    if (slashOrColon) {
      push(slashOrColon[1]!, slashOrColon[2]!);
      continue;
    }

    const bare = seg.match(/^\$([0-9A-Fa-f]{2,4})$/);
    if (bare) {
      const prev = segments[i - 1];
      const next = segments[i + 1];
      const labelFromPrev = prev && !prev.includes("$") ? prev.replace(/^[^\p{L}\p{N}#]+/u, "") : "";
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

/**
 * Map a `.FACL` / `.FCLT` address token (`$10D2`, `$05`, `$F40C`) to a 4-digit UDS Service 0x22 DID.
 * 2-digit SAE J1979 PIDs (`$05`, `$0C`, `$42`) map to UDS DID `F4xx` (`F405`, `F40C`, `F442`),
 * matching SSM4 `12002_InspectionResultsIdlingData.FCLT` and `12022_TM.FCLT`.
 */
export function ssmAddressToUdsDid(addressHex: string): string {
  const clean = addressHex.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (!clean) return "0000";
  if (clean.length <= 2) {
    return `F4${clean.padStart(2, "0")}`;
  }
  return clean.padStart(4, "0").slice(-4);
}

export interface FaclInventoryItem {
  relativePath: string;
  groupId: string;
  listId: string;
  entryCount: number;
  entries: SubaruFaclEntry[];
}

/**
 * Walk a PIDGroup root (e.g. `.../NA/Data/PIDGroup`) and parse every `.FACL` and `.FCLT`.
 */
export function inventoryFaclUnderRoot(
  files: { relativePath: string; bytes: Buffer }[],
): FaclInventoryItem[] {
  const out: FaclInventoryItem[] = [];
  for (const file of files) {
    const lower = file.relativePath.toLowerCase();
    if (!lower.endsWith(".facl") && !lower.endsWith(".fclt")) continue;
    const parts = file.relativePath.replace(/\\/g, "/").split("/");
    const fileName = parts[parts.length - 1] ?? "";
    const groupId = parts.length >= 2 ? parts[parts.length - 2]! : "";
    const listId = fileName.replace(/\.(facl|fclt)$/i, "");
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
