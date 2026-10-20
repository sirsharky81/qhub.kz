import { bytesToHex, hexToBytes } from "./kon.js";

function labelScore(label) {
  const text = String(label ?? "");
  if (!text.trim()) return -1000;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const junk = (text.match(/[^A-Za-z0-9 \[\]]/g) || []).length;
  return letters * 3 - junk * 6 + Math.min(text.length, 40);
}

export function masksFromCaptures(captures) {
  const groups = new Map();
  for (const capture of captures) {
    const key = String(capture.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(capture);
  }

  const masks = new Map();
  for (const [id, items] of groups) {
    const byHex = new Map();
    for (const item of items) {
      if (!String(item.label ?? "").trim() || !item.hex) continue;
      const previous = byHex.get(item.hex);
      if (!previous || labelScore(item.label) > labelScore(previous.label)) byHex.set(item.hex, item);
    }
    const unique = [...byHex.values()];
    if (unique.length === 0) continue;
    const blocks = unique.map((item) => hexToBytes(item.hex));
    const mask = new Uint8Array(blocks[0].length);
    for (let left = 0; left < blocks.length; left++) {
      for (let right = left + 1; right < blocks.length; right++) {
        for (let index = 0; index < mask.length; index++) {
          mask[index] |= blocks[left][index] ^ blocks[right][index];
        }
      }
    }
    const used = mask.some((byte) => byte !== 0);
    masks.set(id, {
      mask: used ? bytesToHex(mask) : null,
      options: unique.map((item, index) => ({
        label: item.label,
        bytes: used ? bytesToHex(blocks[index]) : undefined,
      })),
    });
  }
  return masks;
}

export function mergeCaptures(dictionary, captures) {
  const masks = masksFromCaptures(captures);
  const parameters = dictionary.parameters.map((parameter) => {
    const found = masks.get(String(parameter.id));
    if (!found) return parameter;
    return {
      ...parameter,
      mask: found.mask,
      options: found.options,
    };
  });
  const masksComplete = parameters.every((parameter) => parameter.mask);
  return { ...dictionary, parameters, masksComplete };
}

export function optionMatches(coding, optionBytes, mask) {
  for (let index = 0; index < coding.length; index++) {
    if ((coding[index] & mask[index]) !== (optionBytes[index] & mask[index])) return false;
  }
  return true;
}

export function extractBitfield(coding, bitfield) {
  if (!bitfield) return null;
  const { byteIndex, byteLen = 1, bitPos = 0, bitLen = 8 } = bitfield;
  if (byteIndex < 0 || byteIndex + byteLen > coding.length) return null;
  if (byteLen === 2) {
    const word = (coding[byteIndex] << 8) | coding[byteIndex + 1];
    const mask = bitLen >= 16 ? 0xffff : (1 << bitLen) - 1;
    return (word >>> bitPos) & mask;
  }
  const mask = bitLen >= 8 ? 0xff : (1 << bitLen) - 1;
  return (coding[byteIndex] >>> bitPos) & mask;
}

export function writeBitfield(coding, bitfield, value) {
  const next = typeof Buffer !== "undefined" ? Buffer.from(coding) : new Uint8Array(coding);
  const { byteIndex, byteLen = 1, bitPos = 0, bitLen = 8 } = bitfield;
  if (byteIndex < 0 || byteIndex + byteLen > next.length) {
    throw new Error(`Поле выходит за пределы блока (${coding.length} байт)`);
  }
  const num = Number(value) >>> 0;
  if (byteLen === 2) {
    const fieldMask = (bitLen >= 16 ? 0xffff : (1 << bitLen) - 1) << bitPos;
    const word = ((next[byteIndex] << 8) | next[byteIndex + 1]) & ~fieldMask;
    const updated = word | ((num << bitPos) & fieldMask);
    next[byteIndex] = (updated >>> 8) & 0xff;
    next[byteIndex + 1] = updated & 0xff;
    return next;
  }
  const fieldMask = (bitLen >= 8 ? 0xff : (1 << bitLen) - 1) << bitPos;
  next[byteIndex] = (next[byteIndex] & ~fieldMask) | ((num << bitPos) & fieldMask);
  return next;
}

export function decodeParameter(parameter, coding) {
  if (parameter.bitfield) {
    const rawValue = extractBitfield(coding, parameter.bitfield);
    if (rawValue === null) return { label: null, editable: false };
    const match = (parameter.options ?? []).find((option) => option.value === rawValue);
    const fallbackLabel = `0x${rawValue.toString(16).toUpperCase()} (${rawValue})`;
    return {
      label: match?.label ?? fallbackLabel,
      rawValue,
       unmatched: !match,
      editable: (parameter.options ?? []).length > 0,
    };
  }
  if (!parameter.mask) {
    return { label: null, editable: false };
  }
  const mask = hexToBytes(parameter.mask);
  const match = parameter.options.find(
    (option) => option.bytes && optionMatches(coding, hexToBytes(option.bytes), mask),
  );
  return { label: match?.label ?? null, editable: parameter.options.length > 0 };
}

export function applyOption(coding, parameter, label) {
  if (parameter.bitfield) {
    const option = (parameter.options ?? []).find((item) => item.label === label);
    if (option && typeof option.value === "number") {
      return writeBitfield(coding, parameter.bitfield, option.value);
    }
    const rawMatch = String(label || "").match(/^0x([0-9A-Fa-f]+)\b/);
    if (rawMatch) {
      return writeBitfield(coding, parameter.bitfield, Number.parseInt(rawMatch[1], 16));
    }
    throw new Error(`Нет варианта «${label}» у «${parameter.name}»`);
  }
  if (!parameter.mask) {
    throw new Error(`У параметра «${parameter.name}» ещё нет битовой маски`);
  }
  const option = parameter.options.find((item) => item.label === label);
  if (!option?.bytes) {
    throw new Error(`Нет варианта «${label}» у «${parameter.name}»`);
  }
  const mask = hexToBytes(parameter.mask);
  const value = hexToBytes(option.bytes);
  const next = typeof Buffer !== "undefined" ? Buffer.from(coding) : new Uint8Array(coding);
  for (let index = 0; index < next.length; index++) {
    next[index] = (next[index] & ~mask[index]) | (value[index] & mask[index]);
  }
  return next;
}

export function codingMatchesBaseline(dictionary, coding) {
  if (!dictionary.baselineHex) return false;
  return bytesToHex(coding) === dictionary.baselineHex.toUpperCase();
}
