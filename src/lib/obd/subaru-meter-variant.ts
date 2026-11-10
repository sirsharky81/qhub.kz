import { parseHexBytes, parseUdsResponse } from "./uds";

export interface SubaruMeterWriteLink {
  sendCommand(command: string, timeoutMs?: number): Promise<string>;
  setCanHeader(tx: number, rx?: number): Promise<void>;
  sendPayload(hexPayload: string, timeoutMs?: number): Promise<string>;
}
import {
  asciiFromSubaruDidHex,
  decodeSubaruAppliedModel12Columns,
  parseSubaru12ColumnFromAscii,
} from "./subaru-ssm4-catalog";

/**
 * 32-nibble S-box (`KeyPartsTable`) from SSM4 `CMD_FhiCan.dll` (`0x1000824b` / `0x10008985`)
 * used by `CMD_SecurityAccess` / `CMD_SecurityAccess_Ocpt` (`27 03 -> 27 04` / `27 05 -> 27 06`).
 */
const SUBARU_SECURITY_SBOX_32: readonly number[] = [
  0x5, 0x6, 0x7, 0x1, 0x9, 0xc, 0xd, 0x8, 0xa, 0xd, 0x2, 0xb, 0xf, 0x4, 0x0, 0x3,
  0xb, 0x4, 0x6, 0x0, 0xf, 0x2, 0xd, 0x9, 0x5, 0xc, 0x1, 0xa, 0x3, 0xd, 0xe, 0x8,
];

/**
 * 16x u16 round-key tables (`CVsmRsKeyTable` in `VsmDatabase.dll`) for Subaru Combination Meter (783):
 * - `12445_API__309D` / `12445_API2_30A0` (SGP Gen2 Color LCD Meter, e.g. Outback BT / Legacy BW / Forester SK / Ascent WM)
 * - `12440_API__3098` / `12440_API2_309E` (SGP Gen1 Color LCD Meter, e.g. Impreza GK/GT / Crosstrek)
 * - `12450_API__30A2` / `12450_API2_30A4` (Combination Meter Type B)
 */
export const SUBARU_METER_SECURITY_KEY_TABLES: readonly {
  id: string;
  label: string;
  words: readonly number[];
}[] = [
  {
    id: "CTRL_IDX11_LE",
    label: "FHIUtilityCtrlNK GetSecAccess idx=11 (MET-002/009 0205 standard)",
    words: [
      0x0276, 0x2631, 0x8102, 0x7626, 0x3181, 0x2762, 0x6318, 0x1027,
      0x6263, 0x1812, 0x1813, 0x6267, 0x2018, 0x1362, 0x6720, 0xa276,
    ],
  },
  {
    id: "CTRL_IDX35_LE",
    label: "FHIUtilityCtrlNK GetSecAccess idx=35 (MET-009/010 0205 SSMID 4E*)",
    words: [
      0x0566, 0x3536, 0x2503, 0x9997, 0x2988, 0x0276, 0x1027, 0x0922,
      0x5963, 0x1518, 0x1792, 0x2019, 0x1453, 0x0573, 0x7830, 0xa277,
    ],
  },
  {
    id: "12445_L3",
    label: "12445_API_309D/30A0 L3 (SGP Meter BE)",
    words: [
      0x7602, 0x3126, 0x0281, 0x2676, 0x8131, 0x6227, 0x1863, 0x2710,
      0x6362, 0x1218, 0x1318, 0x6762, 0x1820, 0x6213, 0x2067, 0x76a2,
    ],
  },
  {
    id: "12445_L5",
    label: "12445_API_309D/30A0 L5 (SGP Meter BE)",
    words: [
      0x6605, 0x3635, 0x0325, 0x9799, 0x8829, 0x7602, 0x2710, 0x2209,
      0x6359, 0x1815, 0x9217, 0x1920, 0x5314, 0x7305, 0x3078, 0x77a2,
    ],
  },
  {
    id: "12450_L3",
    label: "12450_API_30A2/30A4 (Meter Type B)",
    words: [
      0x0293, 0x5710, 0x2187, 0x3099, 0x3967, 0x5010, 0x6738, 0x8849,
      0x3922, 0x5576, 0x2930, 0x2957, 0x9231, 0x6527, 0x4038, 0x2511,
    ],
  },
];

/**
 * AES-128-ECB keys (`CVsmRsKeyTableAES` in `VsmDatabase.dll`) for `CMD_SecurityAccess2018CY1`
 * when an SGP module returns a 16-byte seed on `27 03` / `27 01`.
 */
export const SUBARU_SGP_AES128_KEYS: readonly {
  id: string;
  keyHex: string;
}[] = [
  // Combination Meter SGP (ecuKind=0x0012 in FHIUtilityCtrlNK.dll 0x10082228 & VsmDatabase)
  { id: "CTRL_MET_0251_1", keyHex: "00F17B760F53C30CBFFB54AD808F497A" },
  { id: "CTRL_MET_0251_3", keyHex: "76E19EDB3027B6C51C8E90CED15E59BA" },
  // KeyVersion 0251=01/02/03/129/130 across SGP Body/Meter/Gateway/Chassis ECUs
  { id: "12234_0251_1", keyHex: "8C15AC1E0EDFB84D8A1C1526CDFF0850" },
  { id: "12234_0251_2", keyHex: "0F84E1C95C8277A370E6CE71BFA6831D" },
  { id: "12234_0251_129", keyHex: "1615239AB78925A41F18E6AA07673581" },
  { id: "12236_0251_130", keyHex: "6A673120695FD8431286925F8601F955" },
  { id: "CTRL_CGW_0251_1", keyHex: "7D89DDE1C95A224ED723E04496F4C0AE" },
  { id: "CTRL_CGW_0251_2", keyHex: "C92270E66463395407F6C3014DC890B0" },
  { id: "CTRL_CGW_0251_193", keyHex: "66D5364A0D2D45C67E8DB120ED471438" },
  { id: "CTRL_CGW_0251_194", keyHex: "37490E2C46C57F8CB22FEC48133965D6" },
  { id: "12555_0251_1", keyHex: "35371DE1F774FC0123A8AE67A725D1BB" },
  { id: "12625_0251_1", keyHex: "7168633A55270B3BA4E873BBBC248EC6" },
  { id: "12627_0251_1", keyHex: "18852C9509C8610F3E894CD8F23EB30D" },
  { id: "12645_0251_1", keyHex: "0D816973C75E8B38B920061FCEDBCBAE" },
  { id: "12201_0251_3", keyHex: "76E19EDB3027B6C51C8E90CED15E59BA" },
  { id: "12585_0251_2", keyHex: "3C74A203B92DC74A0BC9D36489223F0A" },
  { id: "12265_0251_2", keyHex: "1BF6344AA6256C70E45D8754CD653FB2" },
  { id: "12265_0251_3", keyHex: "7692E7932F23A901568DDFA5FF580625" },
  { id: "12265_0251_4", keyHex: "1B8E5CE1CA38AEB6B4AC07C62FC8D769" },
];

function subaruFeistelRound16(ax: number): number {
  const c0 = ((ax & 1) << 4) | ((ax >>> 12) & 0x0f);
  const c1 = (ax >>> 8) & 0x1f;
  const c2 = (ax >>> 4) & 0x1f;
  const c3 = ax & 0x1f;
  const v =
    ((SUBARU_SECURITY_SBOX_32[c0]! << 12) |
      (SUBARU_SECURITY_SBOX_32[c1]! << 8) |
      (SUBARU_SECURITY_SBOX_32[c2]! << 4) |
      SUBARU_SECURITY_SBOX_32[c3]!) &
    0xffff;
  return (((v & 0x07) << 13) | (v >>> 3)) & 0xffff;
}

/**
 * Computes the 4-byte SecurityAccess key from a 4-byte seed using:
 * - `"ctrl-mode1"`: exact `GetSecAccess(seed, mode=1)` from `FHIUtilityCtrlNK.dll` (`0x1004DED0`),
 *   invoked by `MET-002.srp` / `MET-009.srp` (`GetSecurityAccessSelKey("11" | "35")`) after passcode `0205`.
 * - `"standard-l3"` / `"standard-l5"` / `"ocpt"`: `CMD_SecurityAccess` (`0x10007fa0`) in `CMD_FhiCan.dll`.
 */
export function computeSubaruSecurityKey4Byte(
  seedBytes: readonly number[],
  roundWords: readonly number[],
  mode: "ctrl-mode1" | "standard-l3" | "standard-l5" | "ocpt" = "ctrl-mode1",
): number[] {
  if (seedBytes.length < 4 || roundWords.length < 16) return [];
  const s0 = seedBytes[0]! & 0xff;
  const s1 = seedBytes[1]! & 0xff;
  const s2 = seedBytes[2]! & 0xff;
  const s3 = seedBytes[3]! & 0xff;

  let esp10: number;
  let ebx: number;
  if (mode === "ocpt") {
    esp10 = ((s0 << 8) | s1) & 0xffff;
    ebx = ((s2 << 8) | s3) & 0xffff;
  } else if (mode === "standard-l5") {
    esp10 = ((s2 << 8) | s1) & 0xffff;
    ebx = ((s3 << 8) | s0) & 0xffff;
  } else {
    // Both "ctrl-mode1" (GetSecAccess mode=1) and "standard-l3" pack:
    // high16 = (s2 << 8) | s0, low16 = (s1 << 8) | s3
    esp10 = ((s2 << 8) | s0) & 0xffff;
    ebx = ((s1 << 8) | s3) & 0xffff;
  }

  for (let i = 15; i >= 0; i--) {
    const ecx = (subaruFeistelRound16((ebx ^ roundWords[i]!) & 0xffff) ^ esp10) & 0xffff;
    esp10 = ebx;
    ebx = ecx;
  }

  if (mode === "ctrl-mode1") {
    // Exact byte output of GetSecAccess (0x1004DED0..0x1004DF76) for mode=1 (idx 11 and idx 35):
    // after swap: ebx32 = (ebx << 16) | esp10 -> out[0]=esp10_lo, out[1]=ebx_lo, out[2]=esp10_hi, out[3]=ebx_hi
    return [esp10 & 0xff, ebx & 0xff, (esp10 >>> 8) & 0xff, (ebx >>> 8) & 0xff];
  }
  if (mode === "ocpt") {
    return [(ebx >>> 8) & 0xff, ebx & 0xff, (esp10 >>> 8) & 0xff, esp10 & 0xff];
  }
  if (mode === "standard-l5") {
    return [esp10 & 0xff, (ebx >>> 8) & 0xff, (esp10 >>> 8) & 0xff, ebx & 0xff];
  }
  return [esp10 & 0xff, (esp10 >>> 8) & 0xff, (ebx >>> 8) & 0xff, ebx & 0xff];
}

// Pure-TS FIPS-197 AES-128 single-block ECB encrypt for `CMD_SecurityAccess2018CY1` (16-byte seed -> 16-byte key)
const AES_SBOX: readonly number[] = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
];

function xtime(a: number): number {
  return ((a << 1) ^ ((a & 0x80) !== 0 ? 0x1b : 0)) & 0xff;
}

/**
 * Computes the 16-byte SecurityAccess key from a 16-byte seed using SSM4 `CMD_SecurityAccess2018CY1` (AES-128-ECB encrypt).
 */
export function computeSubaruSecurityKey16ByteAesEcb(
  seed16: readonly number[],
  key16: readonly number[],
): number[] {
  if (seed16.length !== 16 || key16.length !== 16) return [];
  const w = new Array<number>(176);
  for (let i = 0; i < 16; i++) w[i] = key16[i]! & 0xff;
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4]!;
    let t1 = w[i - 3]!;
    let t2 = w[i - 2]!;
    let t3 = w[i - 1]!;
    if (i % 16 === 0) {
      const tmp = t0;
      t0 = AES_SBOX[t1]! ^ rcon;
      t1 = AES_SBOX[t2]!;
      t2 = AES_SBOX[t3]!;
      t3 = AES_SBOX[tmp]!;
      rcon = xtime(rcon);
    }
    w[i] = w[i - 16]! ^ t0;
    w[i + 1] = w[i - 15]! ^ t1;
    w[i + 2] = w[i - 14]! ^ t2;
    w[i + 3] = w[i - 13]! ^ t3;
  }

  let s = seed16.map((b) => b & 0xff);
  for (let i = 0; i < 16; i++) s[i] = s[i]! ^ w[i]!;

  for (let round = 1; round <= 10; round++) {
    for (let i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]!]!;
    s = [
      s[0]!, s[5]!, s[10]!, s[15]!,
      s[4]!, s[9]!, s[14]!, s[3]!,
      s[8]!, s[13]!, s[2]!, s[7]!,
      s[12]!, s[1]!, s[6]!, s[11]!,
    ];
    if (round < 10) {
      for (let c = 0; c < 16; c += 4) {
        const a0 = s[c]!;
        const a1 = s[c + 1]!;
        const a2 = s[c + 2]!;
        const a3 = s[c + 3]!;
        const t = a0 ^ a1 ^ a2 ^ a3;
        s[c] = a0 ^ t ^ xtime(a0 ^ a1);
        s[c + 1] = a1 ^ t ^ xtime(a1 ^ a2);
        s[c + 2] = a2 ^ t ^ xtime(a2 ^ a3);
        s[c + 3] = a3 ^ t ^ xtime(a3 ^ a0);
      }
    }
    const base = round * 16;
    for (let i = 0; i < 16; i++) s[i] = (s[i]! ^ w[base + i]!) & 0xff;
  }
  return s;
}

/** Procedure B write targets only — never odometer / common-area DIDs. */
export const SUBARU_METER_WRITE_DIDS = ["0250", "0251"] as const;

/** US/Canada TPMS 315 MHz. EC/EA (433 MHz) are rejected. */
export const SUBARU_METER_WRITE_ALLOWED_DESTINATIONS = ["U4", "U5", "U6", "C0", "C5"] as const;

const APPLIED_MODEL_RE =
  /^(BT[9A]|BW[9A]|SK[79]|GT[7A]|GU[7A]|GK[7A]|WMA)[A-Z][YLK5][A-Z0-9]{2}$/;

const METER_TARGETS: { tx: number; rx: number }[] = [
  { tx: 0x783, rx: 0x78b },
  { tx: 0x7c0, rx: 0x7c8 },
];

export type SubaruMeterWriteDestination =
  (typeof SUBARU_METER_WRITE_ALLOWED_DESTINATIONS)[number];

export interface SubaruMeterDidSnapshot {
  did: string;
  hex: string;
}

export interface SubaruMeterWriteCandidate {
  did: (typeof SUBARU_METER_WRITE_DIDS)[number];
  dataHex: string;
  requestHex: string;
  noteRu: string;
}

export interface SubaruMeter12ColumnWritePlan {
  ok: boolean;
  appliedModel: string;
  optionCode: string;
  packedAscii: string;
  destinationPrefix: string;
  destinationRu: string;
  reasonRu: string;
  candidates: SubaruMeterWriteCandidate[];
}

export interface SubaruMeter12ColumnWriteResult {
  success: boolean;
  steps: string[];
  plan: SubaruMeter12ColumnWritePlan;
  writtenDid: string | null;
  writtenHex: string | null;
  securityAccessRequired: boolean;
  seedHex?: string | null;
}

export function isSubaruMeterWriteDestination(
  prefix: string,
): prefix is SubaruMeterWriteDestination {
  return (SUBARU_METER_WRITE_ALLOWED_DESTINATIONS as readonly string[]).includes(prefix);
}

export function normalizeSubaruMeter12ColumnWriteInput(
  appliedModelInput: string,
  optionCodeInput: string,
): { ok: true; appliedModel: string; optionCode: string } | { ok: false; reasonRu: string } {
  const appliedModel = appliedModelInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const optionCode = optionCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (appliedModel.length !== 7 || optionCode.length !== 4) {
    return { ok: false, reasonRu: "Нужны ровно 7 символов Applied Model и 4 символа Option Code." };
  }
  if (!APPLIED_MODEL_RE.test(appliedModel)) {
    return {
      ok: false,
      reasonRu: `Applied Model «${appliedModel}» не похож на Subaru 12-column (BTA/BT9/SK/GT/WM…).`,
    };
  }
  const dest = optionCode.slice(0, 2);
  if (dest === "EC" || dest === "EA") {
    return {
      ok: false,
      reasonRu:
        "Коды EC/EA (Европа / СНГ, TPMS 433 МГц) запрещены. Для США/Канады только U4, U5, U6, C0, C5 (TPMS 315 МГц).",
    };
  }
  if (!isSubaruMeterWriteDestination(dest)) {
    return {
      ok: false,
      reasonRu: `Регион «${dest}» не из списка записи US/Canada (U4/U5/U6/C0/C5).`,
    };
  }
  return { ok: true, appliedModel, optionCode };
}

function asciiBytes(text: string): number[] {
  return [...text].map((ch) => ch.charCodeAt(0));
}

function spacedHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function compactHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function didBytes(hex: string): number[] {
  return parseHexBytes(hex) ?? [];
}

function xor8(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc ^ b, 0) & 0xff;
}

function sum8(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc + b, 0) & 0xff;
}

function trailerFor(oldBody: number[], newBody: number[], oldTrailer: number): number {
  if (oldTrailer === 0x00 || oldTrailer === 0x20) return oldTrailer;
  if (oldTrailer === xor8(oldBody)) return xor8(newBody);
  if (oldTrailer === sum8(oldBody)) return sum8(newBody);
  const oldTwos = (0x100 - sum8(oldBody)) & 0xff;
  if (oldTrailer === oldTwos) return (0x100 - sum8(newBody)) & 0xff;
  return oldTrailer;
}

function isPrintableAscii(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

function splicePackedAscii(current: number[], packed: string): number[] | null {
  const packedBytes = asciiBytes(packed);
  if (packedBytes.length !== 11) return null;

  for (let i = 0; i + 11 <= current.length; i++) {
    const slice = current.slice(i, i + 11);
    if (!slice.every(isPrintableAscii)) continue;
    const parsed = parseSubaru12ColumnFromAscii(String.fromCharCode(...slice));
    if (!parsed.appliedModel || !parsed.optionCode) continue;
    const next = current.slice();
    for (let j = 0; j < packedBytes.length; j++) next[i + j] = packedBytes[j]!;
    if (i + 12 <= next.length) {
      const oldBody = current.slice(i, i + 11);
      next[i + 11] = trailerFor(oldBody, packedBytes, current[i + 11]!);
    }
    return next;
  }

  if (current.length === 11) return packedBytes;
  if (current.length === 12) {
    return [...packedBytes, trailerFor(current.slice(0, 11), packedBytes, current[11]!)];
  }
  return null;
}

function splicePackedUtf16Le(current: number[], packed: string): number[] | null {
  if (packed.length !== 11) return null;
  for (let i = 0; i + 22 <= current.length; i++) {
    let text = "";
    let ok = true;
    for (let c = 0; c < 11; c++) {
      const lo = current[i + c * 2]!;
      const hi = current[i + c * 2 + 1]!;
      if (hi !== 0 || !isPrintableAscii(lo)) {
        ok = false;
        break;
      }
      text += String.fromCharCode(lo);
    }
    if (!ok) continue;
    const parsed = parseSubaru12ColumnFromAscii(text);
    if (!parsed.appliedModel || !parsed.optionCode) continue;
    const next = current.slice();
    for (let c = 0; c < packed.length; c++) {
      next[i + c * 2] = packed.charCodeAt(c);
      next[i + c * 2 + 1] = 0x00;
    }
    return next;
  }
  return null;
}

function candidate(
  did: (typeof SUBARU_METER_WRITE_DIDS)[number],
  data: number[],
  noteRu: string,
): SubaruMeterWriteCandidate {
  const dataHex = spacedHex(data);
  return {
    did,
    dataHex,
    requestHex: `2E${did}${compactHex(data)}`,
    noteRu,
  };
}

function assertWriteCandidate(item: SubaruMeterWriteCandidate): void {
  if (item.did !== "0250" && item.did !== "0251") {
    throw new Error("Запись разрешена только в DID 0250/0251.");
  }
  if (!item.requestHex.startsWith(`2E${item.did}`)) {
    throw new Error("Кандидат записи должен быть UDS 2E на DID 0250 или 0251.");
  }
  if (item.requestHex.length < 10) {
    throw new Error("Пустой payload записи приборки.");
  }
}

/**
 * Builds UDS 2E payloads for Combination Meter Procedure B (sendMetVariByApplied).
 * Prefers splicing Applied+Option into the live DID layout so length/padding/checksum stay.
 */
export function buildSubaruMeter12ColumnWritePlan(
  appliedModelInput: string,
  optionCodeInput: string,
  currentDids: SubaruMeterDidSnapshot[] = [],
): SubaruMeter12ColumnWritePlan {
  const normalized = normalizeSubaruMeter12ColumnWriteInput(appliedModelInput, optionCodeInput);
  if (!normalized.ok) {
    return {
      ok: false,
      appliedModel: appliedModelInput.trim().toUpperCase(),
      optionCode: optionCodeInput.trim().toUpperCase(),
      packedAscii: "",
      destinationPrefix: "",
      destinationRu: "",
      reasonRu: normalized.reasonRu,
      candidates: [],
    };
  }

  const { appliedModel, optionCode } = normalized;
  const packedAscii = `${appliedModel}${optionCode}`;
  const decoded = decodeSubaruAppliedModel12Columns(appliedModel, optionCode);
  const packedBytes = asciiBytes(packedAscii);
  const candidates: SubaruMeterWriteCandidate[] = [];
  const seen = new Set<string>();

  const push = (item: SubaruMeterWriteCandidate) => {
    assertWriteCandidate(item);
    if (seen.has(item.requestHex)) return;
    seen.add(item.requestHex);
    candidates.push(item);
  };

  for (const did of SUBARU_METER_WRITE_DIDS) {
    const snap = currentDids.find((d) => d.did === did);
    if (!snap) continue;
    const current = didBytes(snap.hex);
    if (current.length === 0) continue;

    const spliced =
      splicePackedAscii(current, packedAscii) ?? splicePackedUtf16Le(current, packedAscii);
    if (spliced) {
      push(
        candidate(
          did,
          spliced,
          `Срастить ${packedAscii} в текущий DID ${did} (${current.length} байт, длина сохранена)`,
        ),
      );
      continue;
    }

    if (current.length === 11 || current.length === 12) {
      const data =
        current.length === 12
          ? [...packedBytes, trailerFor(current.slice(0, 11), packedBytes, current[11]!)]
          : packedBytes;
      push(
        candidate(
          did,
          data,
          `Заменить DID ${did} целиком (${current.length} байт) на ASCII ${packedAscii}`,
        ),
      );
    }
  }

  if (candidates.length === 0) {
    const hasDidBytes = currentDids.some(
      (d) => (d.did === "0250" || d.did === "0251") && didBytes(d.hex).length > 0,
    );
    if (hasDidBytes) {
      const preview = currentDids
        .filter((d) => d.did === "0250" || d.did === "0251")
        .map((d) => `${d.did}=${d.hex} (${asciiFromSubaruDidHex(d.hex)})`)
        .join("; ");
      return {
        ok: false,
        appliedModel,
        optionCode,
        packedAscii,
        destinationPrefix: decoded.optionDestinationPrefix,
        destinationRu: decoded.optionDestinationRu,
        reasonRu:
          `DID 0250/0251 не содержат ASCII Applied+Option (похоже на битовую маску). Запись угадана не будет: ${preview || "пусто"}.`,
        candidates: [],
      };
    }
    push(candidate("0250", packedBytes, `11 байт ASCII ${packedAscii} в DID 0250`));
    push(
      candidate("0250", [...packedBytes, 0x00], `12 байт ASCII ${packedAscii}+00 в DID 0250`),
    );
    push(candidate("0251", packedBytes, `11 байт ASCII ${packedAscii} в DID 0251 (если 0250 не примет)`));
  }

  return {
    ok: candidates.length > 0,
    appliedModel,
    optionCode,
    packedAscii,
    destinationPrefix: decoded.optionDestinationPrefix,
    destinationRu: decoded.optionDestinationRu,
    reasonRu:
      candidates.length > 0
        ? `Procedure B: UDS 2E только DID 0250/0251, код ${appliedModel} + ${optionCode}. writeCommonArea не используется.`
        : "Нет безопасного payload для записи.",
    candidates,
  };
}

async function openMeterSession(elm: SubaruMeterWriteLink, tx: number, rx: number): Promise<void> {
  try {
    await elm.sendCommand("ATS1");
    await elm.sendCommand("ATH0");
    await elm.sendCommand("ATAL");
  } catch {
    /* ignore */
  }
  await elm.setCanHeader(tx, rx);
  const txHex = tx.toString(16).padStart(3, "0").toUpperCase();
  try {
    await elm.sendCommand(`ATFCSH${txHex}`);
    await elm.sendCommand("ATFCSD30080A");
    await elm.sendCommand("ATFCSM1");
  } catch {
    /* simple adapters */
  }
  await elm.sendPayload("1003", 2_000);
}

/**
 * CGW addresses for `cgwChkAndFilterRemove`.
 * Live Outback BT 2024: `763→76B` + `31 01 02 0C` succeeds first; `750` only wastes time (NO DATA / NRC 33).
 */
const CGW_FILTER_TARGETS: readonly { tx: number; rx: number; label: string }[] = [
  { tx: 0x763, rx: 0x76b, label: "763→76B (cgwChkAndFilterRemove)" },
  { tx: 0x750, rx: 0x758, label: "750→758 (CGTW / Keyless)" },
  { tx: 0x765, rx: 0x76d, label: "765→76D (Telematics / CGW alt)" },
];

/** Prefer CGW-001.srp RID `02 0C` — confirmed on BT 2024 (`7F 31 78` → `71 01 02 0C`). */
const CGW_FILTER_ROUTINES = ["3101020C", "31010200", "31011201"] as const;

/**
 * Executes SSM4 Central Gateway SID Filter Removal (`cgwChkAndFilterRemove` / `cgwSidFilterRemove`
 * in `FHIUtilityCtrlNK.dll` + `CGW-001.srp`).
 *
 * Why this is critical on SGP (2020–2024 Outback BT / Forester SK / Crosstrek / WRX):
 * When the CGW SID filter is active, the gateway passes `22 xx xx` / even returns `7F 2E 33` from Meter,
 * BUT silently drops `27 xx` (`SecurityAccess`) frames to `783`, causing `27 03 -> NO DATA`.
 *
 * Exact sequence from `FHIUtilityCtrlNK.dll` (`cgwSidFilterRemove`):
 * 1. CGW: `10 03` (`50 03`)
 * 2. Read `22 02 50` / `22 02 51` (AES-128 KeyVersion: `01`, `02`, `C1`=193, `C2`=194)
 * 3. Seed `27 07` (`67 07 <16B>`) or `27 01` → AES-128-ECB key → `27 08` / `27 02`
 * 4. FilterRemove: `31 01 02 00` (`71 01 02 00`), `31 01 02 0C` (`CGW-001.srp`), `31 01 12 01`
 *
 * Only a positive `71 01 …` counts as success — SecurityAccess alone does NOT pass `27` to the meter.
 */
export async function unlockSubaruCgwFilterRemove(
  elm: SubaruMeterWriteLink,
  steps: string[],
): Promise<{ filterRemoved: boolean; gatewayLabel: string | null }> {
  const cgwAesKeys = [
    { id: "CTRL_CGW_0251_1", kv: 1, keyHex: "7D89DDE1C95A224ED723E04496F4C0AE" },
    { id: "CTRL_CGW_0251_2", kv: 2, keyHex: "C92270E66463395407F6C3014DC890B0" },
    { id: "CTRL_CGW_0251_193", kv: 193, keyHex: "66D5364A0D2D45C67E8DB120ED471438" },
    { id: "CTRL_CGW_0251_194", kv: 194, keyHex: "37490E2C46C57F8CB22FEC48133965D6" },
    { id: "12234_0251_1", kv: 1, keyHex: "8C15AC1E0EDFB84D8A1C1526CDFF0850" },
    { id: "12234_0251_2", kv: 2, keyHex: "0F84E1C95C8277A370E6CE71BFA6831D" },
    { id: "12234_0251_129", kv: 129, keyHex: "1615239AB78925A41F18E6AA07673581" },
    { id: "12236_0251_130", kv: 130, keyHex: "6A673120695FD8431286925F8601F955" },
  ];

  for (const gw of CGW_FILTER_TARGETS) {
    const label = gw.label;
    try {
      await openMeterSession(elm, gw.tx, gw.rx);
      steps.push(`${label}: расширенная сессия шлюза (10 03)`);
    } catch {
      steps.push(`${label}: шлюз не ответил на 10 03`);
      continue;
    }

    // Fast path (BT 2024): 10 03 → 31 01 02 0C (may return 7F 31 78 + 71 01 02 0C in one ELM buffer)
    for (const routineHex of CGW_FILTER_ROUTINES) {
      try {
        const rawR = await elm.sendPayload(routineHex, 3_000);
        const pR = parseUdsResponse(rawR, 0x31);
        const clean = rawR.replace(/>/g, "").trim();
        if (pR.kind === "positive") {
          steps.push(
            `${label}: ✓ фильтр SID снят (${routineHex.slice(0, 2)} ${routineHex.slice(2, 4)} ${routineHex.slice(4, 6)} ${routineHex.slice(6)} → ${clean})`,
          );
          return { filterRemoved: true, gatewayLabel: label };
        }
        if (pR.kind === "negative") {
          steps.push(
            `${label}: ${routineHex.slice(0, 2)} ${routineHex.slice(2, 4)} ${routineHex.slice(4, 6)} ${routineHex.slice(6)} → ${clean} (${pR.nrcText ?? `NRC ${pR.nrc}`})`,
          );
        }
      } catch {
        /* ignore */
      }
    }

    let cgwKeyVersion: number | null = null;
    try {
      const raw0251 = await elm.sendPayload("220251", 1_500);
      const p0251 = parseUdsResponse(raw0251, 0x22);
      if (p0251.kind === "positive" && p0251.payload.length >= 3) {
        cgwKeyVersion = p0251.payload[2] ?? p0251.payload[p0251.payload.length - 1] ?? null;
        steps.push(
          `${label}: 22 0251 → KeyVersion=${cgwKeyVersion} (0x${(cgwKeyVersion ?? 0).toString(16).toUpperCase().padStart(2, "0")})`,
        );
      }
    } catch {
      /* ignore */
    }

    const orderedKeys = [...cgwAesKeys].sort((a, b) => {
      if (cgwKeyVersion != null) {
        const aMatch = a.kv === cgwKeyVersion ? 0 : 1;
        const bMatch = b.kv === cgwKeyVersion ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      return 0;
    });

    let cgwSecurityUnlocked = false;
    for (const pair of [
      { seedSub: "2707", keySub: "2708" },
      { seedSub: "2701", keySub: "2702" },
    ]) {
      let rawSeed = "";
      try {
        await elm.sendPayload("1003", 1_500);
        rawSeed = await elm.sendPayload(pair.seedSub, 3_000);
      } catch {
        continue;
      }
      const pSeed = parseUdsResponse(rawSeed, 0x27);
      const cleanSeed = rawSeed.replace(/>/g, "").trim();
      if (pSeed.kind !== "positive" || pSeed.payload.length < 2) {
        steps.push(
          `${label}: Seed ${pair.seedSub.slice(0, 2)} ${pair.seedSub.slice(2)} → ${cleanSeed || "NO DATA"}` +
            (pSeed.kind === "negative" ? ` (${pSeed.nrcText ?? "NRC"})` : ""),
        );
        continue;
      }
      const subByte = Number.parseInt(pair.seedSub.slice(2), 16);
      let seedBytes = pSeed.payload[0] === subByte ? pSeed.payload.slice(1) : pSeed.payload;
      if (isZeroSeed(seedBytes)) {
        steps.push(`${label}: ${pair.seedSub} → нулевой Seed (SecurityAccess уже открыт)`);
        cgwSecurityUnlocked = true;
        break;
      }
      steps.push(
        `${label}: получен Seed (${seedBytes.length} байт) на ${pair.seedSub.slice(0, 2)} ${pair.seedSub.slice(2)}: ${spacedHex(seedBytes)}`,
      );
      if (seedBytes.length !== 16) continue;

      for (let i = 0; i < orderedKeys.length; i++) {
        const aes = orderedKeys[i]!;
        if (i > 0) {
          try {
            await elm.sendPayload("1003", 1_500);
            const r2 = await elm.sendPayload(pair.seedSub, 3_000);
            const p2 = parseUdsResponse(r2, 0x27);
            if (p2.kind === "positive" && p2.payload.length >= 17) {
              seedBytes = p2.payload[0] === subByte ? p2.payload.slice(1) : p2.payload;
              if (isZeroSeed(seedBytes)) {
                cgwSecurityUnlocked = true;
                break;
              }
            }
          } catch {
            /* ignore */
          }
        }
        const outBytes = computeSubaruSecurityKey16ByteAesEcb(seedBytes, didBytes(aes.keyHex));
        const rawKey = await elm.sendPayload(`${pair.keySub}${compactHex(outBytes)}`, 3_000);
        const pKey = parseUdsResponse(rawKey, 0x27);
        steps.push(
          `${label}: Key ${pair.keySub.slice(0, 2)} ${pair.keySub.slice(2)} (${aes.id}) → ${rawKey.replace(/>/g, "").trim() || "NO DATA"}`,
        );
        if (pKey.kind === "positive") {
          cgwSecurityUnlocked = true;
          break;
        }
        if (pKey.kind === "negative" && (pKey.nrc === 0x36 || pKey.nrc === 0x37)) {
          break;
        }
      }
      if (cgwSecurityUnlocked) break;
    }

    if (!cgwSecurityUnlocked) {
      steps.push(`${label}: SecurityAccess шлюза не открыт — пробуем следующий адрес CGW`);
      continue;
    }

    for (const routineHex of CGW_FILTER_ROUTINES) {
      try {
        const rawR = await elm.sendPayload(routineHex, 3_000);
        const pR = parseUdsResponse(rawR, 0x31);
        const clean = rawR.replace(/>/g, "").trim();
        if (pR.kind === "positive") {
          steps.push(
            `${label}: ✓ фильтр SID снят после SecurityAccess (${routineHex.slice(0, 2)} ${routineHex.slice(2, 4)} ${routineHex.slice(4, 6)} ${routineHex.slice(6)} → ${clean})`,
          );
          return { filterRemoved: true, gatewayLabel: label };
        }
        steps.push(
          `${label}: FilterRemove ${routineHex} → ${clean || "NO DATA"}${pR.kind === "negative" ? ` (${pR.nrcText ?? `NRC ${pR.nrc}`})` : ""}`,
        );
      } catch {
        /* ignore */
      }
    }
  }

  steps.push(
    "CGW: не удалось снять SID-фильтр (750/763/765). Пока фильтр активен, приборка отвечает на 22/2E, но глушит 27 xx → NO DATA.",
  );
  return { filterRemoved: false, gatewayLabel: null };
}

async function closeMeterSession(elm: SubaruMeterWriteLink): Promise<void> {
  try {
    await elm.sendPayload("1001", 1_000);
  } catch {
    /* ignore */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isZeroSeed(seed: readonly number[]): boolean {
  return seed.length > 0 && seed.every((b) => b === 0);
}

/**
 * Unlocks Combination Meter (`783 -> 78B` / `7C0 -> 7C8`) SecurityAccess (`27 03 -> 27 04` / `27 01 -> 27 02`)
 * per SSM4 `MET-002.srp` (`CMD_SecurityAccess` / `CMD_SecurityAccess2018CY1` in `CMD_FhiCan.dll`).
 */
export async function unlockSubaruMeterSecurityAccess(
  elm: SubaruMeterWriteLink,
  tx: number,
  rx: number,
  steps: string[],
  options: {
    userKeyHex?: string;
    keyVersionByte?: number | null;
  } = {},
): Promise<{ unlocked: boolean; seedHex: string | null }> {
  const txHex = tx.toString(16).toUpperCase();
  const rxHex = rx.toString(16).toUpperCase();
  const cleanUserKey = (options.userKeyHex ?? "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  let lastSeedHex: string | null = null;

  // MET-002/009 Block B06 only uses 27 03→27 04; 27 01→27 02 is the AES/legacy fallback.
  for (const pair of [
    { seedSub: "2703", keySub: "2704", level: 3 as const },
    { seedSub: "2701", keySub: "2702", level: 1 as const },
  ]) {
    let rawSeed = "";
    try {
      await elm.sendPayload("1003", 1_500);
      rawSeed = await elm.sendPayload(pair.seedSub, 2_500);
    } catch (err) {
      steps.push(
        `${txHex}→${rxHex}: ${pair.seedSub} ошибка отправки (${err instanceof Error ? err.message : String(err)})`,
      );
      continue;
    }
    const pSeed = parseUdsResponse(rawSeed, 0x27);
    const cleanSeed = rawSeed.replace(/>/g, "").trim();
    if (pSeed.kind !== "positive" || pSeed.payload.length < 2) {
      steps.push(
        `${txHex}→${rxHex}: запрос Seed ${pair.seedSub.slice(0, 2)} ${pair.seedSub.slice(2)} → ${cleanSeed || "нет ответа"}` +
          (pSeed.kind === "negative" ? ` (${pSeed.nrcText ?? "NRC"})` : ""),
      );
      continue;
    }

    const subByte = Number.parseInt(pair.seedSub.slice(2), 16);
    const seedBytes = pSeed.payload[0] === subByte ? pSeed.payload.slice(1) : pSeed.payload;
    if (isZeroSeed(seedBytes)) {
      steps.push(`${txHex}→${rxHex}: ${pair.seedSub} → нулевой Seed (доступ SecurityAccess уже открыт)`);
      return { unlocked: true, seedHex: spacedHex(seedBytes) };
    }

    lastSeedHex = spacedHex(seedBytes);
    steps.push(
      `${txHex}→${rxHex}: запрос Seed ${pair.seedSub.slice(0, 2)} ${pair.seedSub.slice(2)} → получен Seed (${seedBytes.length} байт): ${lastSeedHex}`,
    );

    // Build candidate keys: user-supplied key first (if length matches), then SSM4 VsmDatabase keys
    const candidates: { label: string; keyHex: string }[] = [];
    if (cleanUserKey.length === seedBytes.length * 2) {
      candidates.push({ label: "пользовательский Key", keyHex: cleanUserKey });
    }

    if (seedBytes.length === 4) {
      const modeOrder: ("ctrl-mode1" | "standard-l3" | "ocpt")[] = [
        "ctrl-mode1",
        "standard-l3",
        "ocpt",
      ];
      for (const tbl of SUBARU_METER_SECURITY_KEY_TABLES) {
        for (const mode of modeOrder) {
          const kBytes = computeSubaruSecurityKey4Byte(seedBytes, tbl.words, mode);
          const kHex = compactHex(kBytes);
          if (kHex.length === 8 && !candidates.some((c) => c.keyHex === kHex)) {
            candidates.push({ label: `${tbl.id} (${mode})`, keyHex: kHex });
          }
        }
      }
    } else if (seedBytes.length === 16) {
      // Prioritize key matching DID 0251 KeyVersion if available
      const kv = options.keyVersionByte;
      const orderedAes = [...SUBARU_SGP_AES128_KEYS].sort((a, b) => {
        if (kv != null) {
          const aMatch = a.id.endsWith(`_${kv}`) ? 0 : 1;
          const bMatch = b.id.endsWith(`_${kv}`) ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
        }
        return 0;
      });
      for (const aes of orderedAes) {
        const keyBytes = didBytes(aes.keyHex);
        const outBytes = computeSubaruSecurityKey16ByteAesEcb(seedBytes, keyBytes);
        const kHex = compactHex(outBytes);
        if (kHex.length === 32 && !candidates.some((c) => c.keyHex === kHex)) {
          candidates.push({ label: `AES-128 ${aes.id}`, keyHex: kHex });
        }
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]!;
      // Re-request seed before 2nd+ candidate if the ECU invalidated the previous seed on NRC 35
      let activeKeyHex = cand.keyHex;
      if (i > 0) {
        try {
          await openMeterSession(elm, tx, rx);
          const r2 = await elm.sendPayload(pair.seedSub, 2_500);
          const p2 = parseUdsResponse(r2, 0x27);
          if (p2.kind === "positive" && p2.payload.length >= 2) {
            const sb2 = p2.payload[0] === subByte ? p2.payload.slice(1) : p2.payload;
            if (isZeroSeed(sb2)) return { unlocked: true, seedHex: lastSeedHex };
            if (sb2.length === seedBytes.length) {
              lastSeedHex = spacedHex(sb2);
              if (sb2.length === 4) {
                const tbl = SUBARU_METER_SECURITY_KEY_TABLES.find((t) => cand.label.startsWith(t.id));
                const mode: "ctrl-mode1" | "standard-l3" | "standard-l5" | "ocpt" = cand.label.includes("ocpt")
                  ? "ocpt"
                  : cand.label.includes("standard-l5")
                    ? "standard-l5"
                    : cand.label.includes("standard-l3")
                      ? "standard-l3"
                      : "ctrl-mode1";
                if (tbl) {
                  activeKeyHex = compactHex(computeSubaruSecurityKey4Byte(sb2, tbl.words, mode));
                }
              } else if (sb2.length === 16) {
                const aes = SUBARU_SGP_AES128_KEYS.find((a) => cand.label.includes(a.id));
                if (aes) {
                  activeKeyHex = compactHex(
                    computeSubaruSecurityKey16ByteAesEcb(sb2, didBytes(aes.keyHex)),
                  );
                }
              }
            }
          }
        } catch {
          /* ignore */
        }
      }

      const rawKey = await elm.sendPayload(`${pair.keySub}${activeKeyHex}`, 3_000);
      const pKey = parseUdsResponse(rawKey, 0x27);
      const cleanKey = rawKey.replace(/>/g, "").trim();
      steps.push(
        `${txHex}→${rxHex}: отправка Key ${pair.keySub.slice(0, 2)} ${pair.keySub.slice(2)} (${cand.label}) → ${cleanKey || "нет ответа"}` +
          (pKey.kind === "negative" ? ` (${pKey.nrcText ?? "NRC"})` : ""),
      );
      if (pKey.kind === "positive") {
        steps.push(`${txHex}→${rxHex}: ✓ доступ SecurityAccess (67 ${pair.keySub.slice(2)}) открыт!`);
        return { unlocked: true, seedHex: lastSeedHex };
      }
      // If ECU locked out with NRC 36 (exceededNumberOfAttempts) or NRC 37 (requiredTimeDelayNotExpired), stop trying keys immediately
      if (pKey.kind === "negative" && (pKey.nrc === 0x36 || pKey.nrc === 0x37)) {
        break;
      }
      // For 16-byte AES SGP modules, try up to 4 prioritized keys (CTRL_MET + 12234) unless ECU returned NRC 36/37
      if (seedBytes.length === 16 && !cleanUserKey && i >= 3) {
        break;
      }
    }
    break;
  }

  return { unlocked: false, seedHex: lastSeedHex };
}

async function sendWriteWithRetry(
  elm: SubaruMeterWriteLink,
  requestHex: string,
  steps: string[],
  label: string,
): Promise<ReturnType<typeof parseUdsResponse>> {
  let last = parseUdsResponse("", 0x2e);
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await elm.sendPayload("3E00", 800);
    } catch {
      /* ignore */
    }
    const raw = await elm.sendPayload(requestHex, 8_000);
    const parsed = parseUdsResponse(raw, 0x2e);
    const clean = raw.replace(/>/g, "").trim();
    steps.push(
      `${label}: попытка ${attempt} → ${clean || "нет ответа"}` +
        (parsed.kind === "negative" ? ` (${parsed.nrcText ?? "NRC"})` : ""),
    );
    last = parsed;
    if (parsed.kind === "positive") return parsed;
    if (parsed.kind === "negative" && parsed.nrc === 0x33) return parsed;
    if (
      parsed.kind === "negative" &&
      (parsed.nrc === 0x21 || parsed.nrc === 0x78 || parsed.nrc === 0x22) &&
      attempt < 6
    ) {
      await sleep(parsed.nrc === 0x78 ? 500 : 350);
      continue;
    }
    return parsed;
  }
  return last;
}

/**
 * Writes Applied Model + Option Code to Combination Meter via UDS 2E DID 0250/0251 or MET-002.srp A002/A011.
 * Never calls writeCommonArea, never writes odometer DIDs.
 */
export async function writeSubaruMeter12ColumnCode(
  elm: SubaruMeterWriteLink,
  input: {
    appliedModel: string;
    optionCode: string;
    currentDids?: SubaruMeterDidSnapshot[];
    txHex?: string;
    rxHex?: string;
    securityKeyHex?: string;
  },
): Promise<SubaruMeter12ColumnWriteResult> {
  const plan = buildSubaruMeter12ColumnWritePlan(
    input.appliedModel,
    input.optionCode,
    input.currentDids ?? [],
  );
  const steps: string[] = [plan.reasonRu];
  const preferredTx = input.txHex ? Number.parseInt(input.txHex, 16) : NaN;
  const preferredRx = input.rxHex ? Number.parseInt(input.rxHex, 16) : NaN;
  const targets =
    Number.isFinite(preferredTx) && Number.isFinite(preferredRx)
      ? [
          { tx: preferredTx, rx: preferredRx },
          ...METER_TARGETS.filter((t) => t.tx !== preferredTx),
        ]
      : METER_TARGETS;

  const destPrefix = input.optionCode.trim().toUpperCase().slice(0, 2);
  // Per MET-002.srp / cgdwPHBWHoZ.mLW: A002 = Destination (02=U4, 03=C0, 05=U5, 06=C5), A011 = Unit region (FF=US °F/MPH, 00=CA °C/km/h)
  const a002TargetByte =
    destPrefix === "C0" ? "03" : destPrefix === "C5" ? "06" : destPrefix === "U5" ? "05" : "02";
  const a011TargetByte = destPrefix === "C0" || destPrefix === "C5" ? "00" : "FF";
  const hasA002Snapshot = (input.currentDids ?? []).some(
    (d) => d.did.toUpperCase() === "A002" || d.did.toUpperCase() === "A011",
  );
  const snap0251 = (input.currentDids ?? []).find((d) => d.did.toUpperCase() === "0251");
  const keyVersionByte = snap0251 ? (didBytes(snap0251.hex)[0] ?? null) : null;

  // If 0250/0251 had non-ASCII bitmask AND A002/A011 is present, allow MET-002.srp A002/A011 write path
  if (!plan.ok && !hasA002Snapshot) {
    return {
      success: false,
      steps,
      plan,
      writtenDid: null,
      writtenHex: null,
      securityAccessRequired: false,
      seedHex: null,
    };
  }

  try {
    await elm.sendCommand("ATSTFF");
  } catch {
    /* ignore */
  }

  let securityAccessRequired = false;
  let writtenDid: string | null = null;
  let writtenHex: string | null = null;
  let lastSeedHex: string | null = null;

  // If A002/A011 already read from the meter, skip dead 2E 0250/0251 attempts (BT 2024 → NRC 31).
  const preferMetA0xxPath = hasA002Snapshot;

  for (const target of targets) {
    const txHex = target.tx.toString(16).toUpperCase();
    const rxHex = target.rx.toString(16).toUpperCase();
    try {
      await openMeterSession(elm, target.tx, target.rx);
      steps.push(`${txHex}→${rxHex}: открыта сессия приборки (10 03)`);
    } catch (error) {
      steps.push(
        `${txHex}→${rxHex}: не удалось открыть 10 03 (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }

    try {
      let did0250OutOfRange = false;
      if (!preferMetA0xxPath) {
        for (const item of plan.candidates) {
          assertWriteCandidate(item);
          const parsed = await sendWriteWithRetry(
            elm,
            item.requestHex,
            steps,
            `${txHex}→${rxHex} 2E ${item.did} (${item.noteRu})`,
          );
          if (parsed.kind === "positive") {
            writtenDid = item.did;
            writtenHex = item.dataHex;
            steps.push(`${txHex}→${rxHex}: DID ${item.did} записан (6E)`);
            break;
          }
          if (parsed.kind === "negative" && parsed.nrc === 0x31) {
            did0250OutOfRange = true;
          }
          if (parsed.kind === "negative" && parsed.nrc === 0x33) {
            securityAccessRequired = true;
            steps.push(
              `${txHex}→${rxHex}: NRC 33 SecurityAccess на DID ${item.did}.`,
            );
            break;
          }
        }
      } else {
        did0250OutOfRange = true;
        steps.push(
          `${txHex}→${rxHex}: SGP / A002 путь — пропускаем 2E 0250/0251 (на BT 2024 всегда NRC 31)`,
        );
      }

      // Live BT 2024 fast path after passcode 0205:
      // 763 31 01 02 0C → 783 22 10C2 → (27 03/04 only if 10C2=00) → 2E 10C2 FF → 2E A002 → 2E A011 → 2E 10C2 00
      if (!writtenDid && !securityAccessRequired && (hasA002Snapshot || did0250OutOfRange)) {
        steps.push(
          `${txHex}→${rxHex}: MET-002/009 (0205) — cgwChkAndFilterRemove → 2E A002 ${a002TargetByte} / A011 ${a011TargetByte}`,
        );

        let cgwOk = false;
        try {
          const cgw = await unlockSubaruCgwFilterRemove(elm, steps);
          cgwOk = cgw.filterRemoved;
          if (cgwOk && cgw.gatewayLabel) {
            steps.push(`${cgw.gatewayLabel}: SID-фильтр снят → ${txHex}→${rxHex}`);
          }
        } catch (err) {
          steps.push(
            `CGW FilterRemove ошибка: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        await openMeterSession(elm, target.tx, target.rx);

        if (!cgwOk) {
          steps.push(
            `${txHex}→${rxHex}: SID-фильтр CGW НЕ снят. Если 2E 10C2 FF вернёт NRC 33 / 27→NO DATA — повторите с IG ON.`,
          );
        }

        // B01: 22 10C2 — on success log gate was already FF, so 27 xx is NOT needed.
        let gateAlreadyOpen = false;
        let gateReturned00 = false;
        try {
          const raw10c2 = await elm.sendPayload("2210C2", 1_500);
          const p10c2 = parseUdsResponse(raw10c2, 0x22);
          steps.push(
            `${txHex}→${rxHex}: 22 10C2 (MET-009 B01) → ${raw10c2.replace(/>/g, "").trim() || "нет ответа"}`,
          );
          if (p10c2.kind === "positive") {
            const val = p10c2.payload[p10c2.payload.length - 1];
            if (val === 0xff) gateAlreadyOpen = true;
            if (val === 0x00) gateReturned00 = true;
          }
        } catch {
          /* ignore */
        }

        if (!gateAlreadyOpen && gateReturned00) {
          steps.push(
            `${txHex}→${rxHex}: Used Mode (10C2=00) — 27 03→27 04 перед 2E 10C2 FF`,
          );
          await elm.sendPayload("1003", 1_500);
          const preUnlock = await unlockSubaruMeterSecurityAccess(elm, target.tx, target.rx, steps, {
            userKeyHex: input.securityKeyHex,
            keyVersionByte,
          });
          if (preUnlock.seedHex) lastSeedHex = preUnlock.seedHex;
        } else if (gateAlreadyOpen) {
          steps.push(`${txHex}→${rxHex}: ворота уже открыты (10C2=FF) — 27 xx не нужен`);
        }

        let pGateOpen = await sendWriteWithRetry(
          elm,
          "2E10C2FF",
          steps,
          `${txHex}→${rxHex} 2E 10C2 FF (MET-002/009 B06 C04)`,
        );
        if (pGateOpen.kind === "negative" && pGateOpen.nrc === 0x33) {
          steps.push(
            `${txHex}→${rxHex}: 2E 10C2 FF → NRC 33 — 27 03→27 04`,
          );
          await elm.sendPayload("1003", 1_500);
          const unlockRes = await unlockSubaruMeterSecurityAccess(elm, target.tx, target.rx, steps, {
            userKeyHex: input.securityKeyHex,
            keyVersionByte,
          });
          if (unlockRes.seedHex) lastSeedHex = unlockRes.seedHex;
          if (unlockRes.unlocked) {
            pGateOpen = await sendWriteWithRetry(
              elm,
              "2E10C2FF",
              steps,
              `${txHex}→${rxHex} 2E 10C2 FF (после 67 04)`,
            );
          }
        }

        if (pGateOpen.kind === "negative" && pGateOpen.nrc === 0x33) {
          securityAccessRequired = true;
          steps.push(
            `${txHex}→${rxHex}: 2E 10C2 FF остался закрыт (NRC 33 SecurityAccess)${lastSeedHex ? ` · Seed: ${lastSeedHex}` : " · Seed не получен (27 xx → NO DATA — CGW всё ещё режет SecurityAccess)"}.`,
          );
        } else {
          let pA002 = await sendWriteWithRetry(
            elm,
            `2EA002${a002TargetByte}`,
            steps,
            `${txHex}→${rxHex} 2E A002 ${a002TargetByte} (Destination ${destPrefix})`,
          );
          if (pA002.kind === "negative" && pA002.nrc === 0x33) {
            const unlockRes = await unlockSubaruMeterSecurityAccess(elm, target.tx, target.rx, steps, {
              userKeyHex: input.securityKeyHex,
              keyVersionByte,
            });
            if (unlockRes.seedHex) lastSeedHex = unlockRes.seedHex;
            if (unlockRes.unlocked) {
              await sendWriteWithRetry(
                elm,
                "2E10C2FF",
                steps,
                `${txHex}→${rxHex} 2E 10C2 FF (повтор открытия после SecurityAccess)`,
              );
              pA002 = await sendWriteWithRetry(
                elm,
                `2EA002${a002TargetByte}`,
                steps,
                `${txHex}→${rxHex} 2E A002 ${a002TargetByte} (повтор Destination ${destPrefix})`,
              );
            }
          }
          const pA011 = await sendWriteWithRetry(
            elm,
            `2EA011${a011TargetByte}`,
            steps,
            `${txHex}→${rxHex} 2E A011 ${a011TargetByte} (${a011TargetByte === "00" ? "°C / км/ч" : "°F / MPH"})`,
          );
          await sendWriteWithRetry(
            elm,
            "2E10C200",
            steps,
            `${txHex}→${rxHex} 2E 10C2 00 (закрытие вариантной записи MET-002 B26 C01)`,
          );
          if (pA002.kind === "positive" || pA011.kind === "positive") {
            writtenDid = "A002/A011";
            writtenHex = `A002=${a002TargetByte} A011=${a011TargetByte}`;
            steps.push(`${txHex}→${rxHex}: вариантные регистры A002/A011 записаны (6E A0 02 / 6E A0 11).`);
          } else if (
            (pA002.kind === "negative" && pA002.nrc === 0x33) ||
            (pA011.kind === "negative" && pA011.nrc === 0x33)
          ) {
            securityAccessRequired = true;
          }
        }
      }
    } finally {
      await closeMeterSession(elm);
      steps.push(`${txHex}→${rxHex}: сессия закрыта (10 01)`);
    }

    if (writtenDid || securityAccessRequired) break;
  }

  if (!writtenDid && !securityAccessRequired) {
    steps.push(
      "Приборка не подтвердила 2E 0250/0251. Проверьте IG ON, адрес 783 и что DID — ASCII, а не битовая маска.",
    );
  }

  return {
    success: writtenDid != null,
    steps,
    plan,
    writtenDid,
    writtenHex,
    securityAccessRequired,
    seedHex: lastSeedHex,
  };
}
