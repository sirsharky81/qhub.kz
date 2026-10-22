/**
 * Mitsubishi ETACS .kon variant-coding file.
 *
 * Logical record is 1230 characters. Files are often stored with a UTF-8 BOM.
 * Offsets below are into the record after the BOM is removed.
 *
 *   2    VIN, 17 chars
 *   80   timestamp YYYYMMDDHHMM
 *   162  ECU id, 8 hex chars
 *   200  coding block, up to 180 hex chars (90 bytes in .kon, 65 bytes in .cuf)
 *   712  second copy of the coding block
 *   1224 CRC, 4 hex chars
 *   1228 two trailing spaces
 */

export const RECORD_LENGTH = 1230;

export const LAYOUT = {
  vin: 2,
  vinLength: 17,
  date: 80,
  dateLength: 12,
  ecu: 162,
  ecuLength: 8,
  hex: 200,
  hexLength: 180,
  hex2: 712,
  crc: 1224,
  crcLength: 4,
};

const HEX_BYTES = LAYOUT.hexLength / 2;

function stripBom(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return { body: buffer.subarray(3), bom: true };
  }
  return { body: buffer, bom: false };
}

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Array.isArray(input)) return Uint8Array.from(input);
  if (typeof input === "string") {
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = input.charCodeAt(i) & 0xff;
    return out;
  }
  throw new Error("Неподдерживаемый формат буфера");
}

function bytesToLatin1(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function latin1ToBytes(text, withBom = false) {
  const offset = withBom ? 3 : 0;
  const out = new Uint8Array(text.length + offset);
  if (withBom) {
    out[0] = 0xef;
    out[1] = 0xbb;
    out[2] = 0xbf;
  }
  for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i) & 0xff;
  return typeof Buffer !== "undefined" ? Buffer.from(out.buffer, out.byteOffset, out.byteLength) : out;
}

function allocBytes(length) {
  return typeof Buffer !== "undefined" ? Buffer.alloc(length) : new Uint8Array(length);
}

function copyBytes(bytes) {
  return typeof Buffer !== "undefined" ? Buffer.from(bytes) : new Uint8Array(bytes);
}

function readField(text, offset, length) {
  return text.slice(offset, offset + length).trim();
}

export function bytesToHex(bytes) {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out.toUpperCase();
}

export function hexToBytes(hex) {
  const clean = hex.trim();
  if (clean.length === 0 || clean.length > LAYOUT.hexLength || clean.length % 2 !== 0) {
    throw new Error(
      `Блок кодировки должен быть чётной длины до ${LAYOUT.hexLength} hex-символов`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error("Блок кодировки содержит не-hex символы");
  }
  const bytes = allocBytes(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function parseKon(input) {
  const buffer = toUint8Array(input);
  const { body, bom } = stripBom(buffer);
  let text = bytesToLatin1(body);
  if (text.length !== RECORD_LENGTH) {
    // Strip trailing CR/LF if a text editor or OS appended a newline
    const trimmed = text.replace(/[\r\n]+$/, "");
    if (trimmed.length === RECORD_LENGTH) {
      text = trimmed;
    } else if (trimmed.length > 1220 && trimmed.length < RECORD_LENGTH) {
      text = trimmed.padEnd(RECORD_LENGTH, " ");
    } else {
      throw new Error(
        `Длина записи ${text.length}, ожидалось ${RECORD_LENGTH} символов без BOM`,
      );
    }
  }

  const vin = readField(text, LAYOUT.vin, LAYOUT.vinLength);
  const date = readField(text, LAYOUT.date, LAYOUT.dateLength);
  const ecuId = readField(text, LAYOUT.ecu, LAYOUT.ecuLength).toUpperCase();
  const hex1 = text.slice(LAYOUT.hex, LAYOUT.hex + LAYOUT.hexLength).trim().toUpperCase();
  const hex2 = text.slice(LAYOUT.hex2, LAYOUT.hex2 + LAYOUT.hexLength).trim().toUpperCase();
  const crc = text.slice(LAYOUT.crc, LAYOUT.crc + LAYOUT.crcLength).toUpperCase();

  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    throw new Error(`VIN не похож на 17 символов: ${vin}`);
  }
  if (!/^\d{12}$/.test(date)) {
    throw new Error(`Дата должна быть YYYYMMDDHHMM: ${date}`);
  }
  if (!/^[0-9A-Z]{8}$/.test(ecuId)) {
    throw new Error(`ECU ID должен быть 8 символов (0-9, A-Z): ${ecuId}`);
  }
  if (!/^[0-9A-F]{4}$/.test(crc)) {
    throw new Error(`CRC должен быть 4 hex-символа: ${crc}`);
  }

  return {
    bom,
    vin,
    date,
    ecuId,
    coding: hexToBytes(hex1),
    codingHex: hex1,
    codingHex2: hex2,
    copiesMatch: hex1 === hex2,
    crc,
    raw: text,
  };
}

export function writeKon(record, options = {}) {
  const bom = options.bom ?? record.bom ?? false;
  const coding =
    record.coding instanceof Uint8Array
      ? record.coding
      : hexToBytes(record.codingHex ?? record.coding);
  if (coding.length === 0 || coding.length > HEX_BYTES) {
    throw new Error(`Блок кодировки должен быть от 1 до ${HEX_BYTES} байт`);
  }
  const hex = bytesToHex(coding);
  const crc = String(record.crc ?? "").toUpperCase();
  if (!/^[0-9A-F]{4}$/.test(crc)) {
    throw new Error(`CRC должен быть 4 hex-символа: ${crc}`);
  }

  const chars = Array(RECORD_LENGTH).fill(" ");
  writeAt(chars, LAYOUT.vin, record.vin);
  writeAt(chars, LAYOUT.date, record.date);
  writeAt(chars, LAYOUT.ecu, record.ecuId.toUpperCase());
  writeAt(chars, LAYOUT.hex, hex);
  writeAt(chars, LAYOUT.hex2, hex);
  writeAt(chars, LAYOUT.crc, crc);
  const text = chars.join("");
  if (text.length !== RECORD_LENGTH) {
    throw new Error(`Собранная запись длиной ${text.length}`);
  }
  return latin1ToBytes(text, bom);
}

function writeAt(chars, offset, value) {
  const text = String(value);
  for (let i = 0; i < text.length; i++) chars[offset + i] = text[i];
}

export function applyCoding(record, coding, crc) {
  return {
    ...record,
    coding: copyBytes(coding),
    codingHex: bytesToHex(coding),
    codingHex2: bytesToHex(coding),
    copiesMatch: true,
    crc,
  };
}
