/**
 * Checksum of an ETACS .kon coding block.
 *
 * The file stores a 4-digit hex CRC. A catalogue of standard CRC-16 variants
 * does not match the three known files, so the fitter searches a wider family
 * and can also learn a linear mask from single-bit samples captured later.
 */

export function crc16(buf, { poly, init = 0, refin = false, refout = false, xorout = 0 }) {
  let crc = init & 0xffff;
  for (const byte of buf) {
    let value = byte;
    if (refin) value = reflect8(value);
    crc ^= value << 8;
    crc &= 0xffff;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ poly) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  if (refout) crc = reflect16(crc);
  return (crc ^ xorout) & 0xffff;
}

function reflect8(value) {
  let out = 0;
  for (let i = 0; i < 8; i++) out = (out << 1) | ((value >> i) & 1);
  return out;
}

function reflect16(value) {
  let out = 0;
  for (let i = 0; i < 16; i++) out = (out << 1) | ((value >> i) & 1);
  return out;
}

const NAMED = [
  { name: "CCITT-FALSE", poly: 0x1021, init: 0xffff, refin: false, refout: false, xorout: 0 },
  { name: "XMODEM", poly: 0x1021, init: 0, refin: false, refout: false, xorout: 0 },
  { name: "ARC", poly: 0x8005, init: 0, refin: true, refout: true, xorout: 0 },
  { name: "MODBUS", poly: 0x8005, init: 0xffff, refin: true, refout: true, xorout: 0 },
  { name: "KERMIT", poly: 0x1021, init: 0, refin: true, refout: true, xorout: 0 },
  { name: "X-25", poly: 0x1021, init: 0xffff, refin: true, refout: true, xorout: 0xffff },
  { name: "GENIBUS", poly: 0x1021, init: 0xffff, refin: false, refout: false, xorout: 0xffff },
  { name: "MAXIM", poly: 0x8005, init: 0, refin: true, refout: true, xorout: 0xffff },
  { name: "USB", poly: 0x8005, init: 0xffff, refin: true, refout: true, xorout: 0xffff },
];

function sliceOf(bytes, start, end) {
  return bytes.subarray(start, end);
}

/**
 * Try named CRC-16 variants over every subrange of the 90-byte block,
 * and over the ASCII hex of that block. Returns the first algorithm that
 * matches every sample, or null.
 */
function codingToHex(coding) {
  if (coding instanceof Uint8Array) {
    let out = "";
    for (const byte of coding) out += byte.toString(16).padStart(2, "0");
    return out.toUpperCase();
  }
  return String(coding).replace(/\s+/g, "").toUpperCase();
}

function asciiBytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

export function fitNamedCrc(samples) {
  const length = samples[0].coding.length;
  for (const algo of NAMED) {
    for (let start = 0; start < length; start++) {
      for (let end = start + 1; end <= length; end++) {
        if (matches(samples, (coding) => crc16(sliceOf(coding, start, end), algo))) {
          return { kind: "crc16", ...algo, start, end, input: "bytes" };
        }
      }
    }
    if (
      matches(samples, (coding) =>
        crc16(asciiBytes(codingToHex(coding).toLowerCase()), algo),
      )
    ) {
      return { kind: "crc16", ...algo, input: "ascii-hex" };
    }
  }
  return null;
}

function matches(samples, fn) {
  return samples.every((sample) => fn(sample.coding, sample) === sample.crc);
}

/**
 * Non-CRC checksums that show up in diagnostic file formats.
 * Each candidate is checked against every sample.
 */
export function fitSimple(samples) {
  const candidates = Object.entries(SIMPLE).map(([name, fn]) => ({ name, fn }));

  for (const candidate of candidates) {
    if (matches(samples, candidate.fn)) {
      return { kind: "simple", name: candidate.name, fnName: candidate.name };
    }
  }
  return null;
}

function sumBytes(coding) {
  let value = 0;
  for (const byte of coding) value += byte;
  return value;
}

function fletcher16(coding) {
  let sum1 = 0;
  let sum2 = 0;
  for (const byte of coding) {
    sum1 = (sum1 + byte) % 255;
    sum2 = (sum2 + sum1) % 255;
  }
  return ((sum2 << 8) | sum1) & 0xffff;
}

/**
 * Learn a 16-bit linear checksum from samples, if the observed CRCs are a
 * linear function of the coding bits over GF(2). Needs the samples to span
 * the bits we care about; with only a few files this usually stays unsolved.
 * Returns null when the system is inconsistent or underdetermined for a
 * unique answer — callers keep saving unverified until a formula is known.
 */
export function explainLinear(samples) {
  if (samples.length < 2) return { solved: false, reason: "мало образцов" };
  const width = samples[0].coding.length * 8;
  const rows = [];
  const base = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];
    const bits = [];
    for (let byte = 0; byte < base.coding.length; byte++) {
      const diff = base.coding[byte] ^ sample.coding[byte];
      for (let bit = 0; bit < 8; bit++) {
        if (diff & (1 << bit)) bits.push(byte * 8 + bit);
      }
    }
    const crcDiff = base.crc ^ sample.crc;
    rows.push({ bits, crcDiff });
  }
  return {
    solved: false,
    reason: "линейная система по имеющимся файлам не выделяет одну формулу",
    differences: rows.map((row) => ({
      bits: row.bits,
      crcDiff: row.crcDiff.toString(16).padStart(4, "0"),
    })),
    width,
  };
}

export function checksumHex(value) {
  return value.toString(16).padStart(4, "0").toUpperCase();
}

/**
 * Apply a previously stored algorithm description.
 * `simple` algorithms are looked up by name. CRC-16 uses the stored params.
 */
const SIMPLE = {
  sum16: (coding) => sumBytes(coding) & 0xffff,
  "sum16-xor-ffff": (coding) => (sumBytes(coding) ^ 0xffff) & 0xffff,
  "xor-bytes": (coding) => {
    let value = 0;
    for (const byte of coding) value ^= byte;
    return value;
  },
  "sum-be-words": (coding) => {
    let value = 0;
    for (let i = 0; i + 1 < coding.length; i += 2) {
      value = (value + ((coding[i] << 8) | coding[i + 1])) & 0xffff;
    }
    return value;
  },
  "xor-be-words": (coding) => {
    let value = 0;
    for (let i = 0; i + 1 < coding.length; i += 2) {
      value ^= (coding[i] << 8) | coding[i + 1];
    }
    return value;
  },
  fletcher16,
  bsd: (coding) => {
    let crc = 0;
    for (const byte of coding) {
      crc = (crc >> 1) + ((crc & 1) << 15);
      crc = (crc + byte) & 0xffff;
    }
    return crc;
  },
};

function applyGf2(algorithm, coding) {
  const baseHex = String(algorithm.baseHex || "").replace(/\s+/g, "").toUpperCase();
  if (!baseHex || baseHex.length !== coding.length * 2) return null;
  let crc = Number.parseInt(algorithm.baseCrc, 16);
  if (!Number.isFinite(crc)) return null;
  const masks = algorithm.masks ?? {};
  for (let index = 0; index < coding.length; index++) {
    const baseByte = Number.parseInt(baseHex.slice(index * 2, index * 2 + 2), 16);
    const diff = coding[index] ^ baseByte;
    if (!diff) continue;
    for (let bit = 0; bit < 8; bit++) {
      if ((diff & (1 << bit)) === 0) continue;
      const mask = masks[`${index}.${bit}`];
      if (mask == null) return null;
      crc ^= Number.parseInt(mask, 16);
    }
  }
  return checksumHex(crc);
}

export function mutCodingCrc(coding, { poly = 0x0811, init = 0x08ea, weight = 0x8612, charXor = 0x20 } = {}) {
  const hex = codingToHex(coding);
  let crc = init & 0xffff;
  let w = weight & 0xffff;
  for (let i = 0; i < hex.length; i++) {
    const v = hex.charCodeAt(i) ^ charXor;
    for (let b = 0; b < 8; b++) {
      if ((v >>> b) & 1) crc ^= w;
      w = w & 0x8000 ? (((w << 1) & 0xffff) ^ poly) : (w << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

export function applyAlgorithm(algorithm, coding) {
  if (!algorithm) return null;
  if (algorithm.kind === "mut-coding-ascii") {
    return checksumHex(mutCodingCrc(coding, algorithm));
  }
  if (algorithm.kind === "crc16") {
    let source = coding;
    if (algorithm.input === "ascii-hex") {
      source = asciiBytes(codingToHex(coding).toLowerCase());
    } else if (algorithm.start != null || algorithm.end != null) {
      source = coding.subarray(algorithm.start ?? 0, algorithm.end ?? coding.length);
    }
    return checksumHex(crc16(source, algorithm));
  }
  if (algorithm.kind === "simple") {
    const fn = SIMPLE[algorithm.name];
    if (!fn) return null;
    return checksumHex(fn(coding));
  }
  if (algorithm.kind === "gf2-delta") return applyGf2(algorithm, coding);
  return null;
}

export function fitGf2FromBitSamples(rows) {
  const master = rows.find((row) => row.kind === "master" || row.hex && row.crc && row.byte == null);
  if (!master?.hex || !master?.crc) return null;
  const masks = {};
  const conflicts = [];
  for (const row of rows) {
    if (row.kind === "bit" || (row.byte != null && row.bit != null && row.xor)) {
      const key = `${row.byte}.${row.bit}`;
      const xor = String(row.xor).toUpperCase().padStart(4, "0");
      if (masks[key] && masks[key] !== xor) conflicts.push({ key, a: masks[key], b: xor });
      else masks[key] = xor;
    }
  }
  const bits = master.hex.length / 2 * 8;
  const known = Object.keys(masks).length;
  return {
    kind: "gf2-delta",
    baseHex: String(master.hex).toUpperCase(),
    baseCrc: String(master.crc).toUpperCase(),
    masks,
    known,
    bits,
    complete: known === bits && conflicts.length === 0,
    conflicts,
  };
}

export function fitChecksum(samples) {
  return fitNamedCrc(samples) ?? fitSimple(samples);
}
