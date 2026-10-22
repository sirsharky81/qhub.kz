import { describe, expect, it } from "vitest";
import {
  backupFileName,
  cleanCodingFileStem,
  detectCodingExtension,
  ensureCodingFileName,
} from "@/app/tools/etacs-coding/etacs-backup";
import { parseKon, writeKon } from "../engine/kon.js";
import { saveEtacsPayload } from "../service";

describe("etacs-backup filename helpers", () => {
  it("always keeps .kon or .cuf at the very end of the filename", () => {
    expect(ensureCodingFileName("8637C671_MMEMCY1XXNH003447", ".kon")).toBe(
      "8637C671_MMEMCY1XXNH003447.kon",
    );
    expect(ensureCodingFileName("8637C671_MMEMCY1XXNH003447.kon", ".kon")).toBe(
      "8637C671_MMEMCY1XXNH003447.kon",
    );
    // If a copy/messenger suffix was appended AFTER the extension, strip it and restore .kon at the end
    expect(ensureCodingFileName("8637C671_MMEMCY1XXNH003447.kon_copy", ".kon")).toBe(
      "8637C671_MMEMCY1XXNH003447.kon",
    );
    expect(ensureCodingFileName("8637C671_MMEMCY1XXNH003447.cuf (1)", ".cuf")).toBe(
      "8637C671_MMEMCY1XXNH003447.cuf",
    );
    // Preserves user-chosen suffixes BEFORE the extension
    expect(ensureCodingFileName("8637C671_orig_20261022_1200", ".kon")).toBe(
      "8637C671_orig_20261022_1200.kon",
    );
    expect(ensureCodingFileName("8637C671_mod_drl_off.kon", ".kon")).toBe(
      "8637C671_mod_drl_off.kon",
    );
  });

  it("detects .kon and .cuf even when OS/browser added a suffix after the extension", () => {
    expect(detectCodingExtension("test.cuf")).toBe(".cuf");
    expect(detectCodingExtension("test.cuf_copy")).toBe(".cuf");
    expect(detectCodingExtension("test.cuf (2)")).toBe(".cuf");
    expect(detectCodingExtension("test.kon_backup")).toBe(".kon");
  });

  it("strips previous backup tags when building a clean stem", () => {
    expect(cleanCodingFileStem("8637C671.original.20261022_1200.kon")).toBe("8637C671");
    const bkp = backupFileName("8637C671_MMEMCY1XXNH003447.kon", "original");
    expect(bkp).toMatch(/^8637C671_MMEMCY1XXNH003447_original_\d{8}_\d{4}\.kon$/);
  });
});

describe("saveEtacsPayload & parseKon roundtrip", () => {
  it("normalizes saved fileName so extension is strictly at the end and file parses back", () => {
    const codingHex = "28820042F008205500A40A041004831A58228C".padEnd(180, "0");
    const saved = saveEtacsPayload({
      force: true,
      vin: "MMEMCY1XXNH003447",
      date: "202610221200",
      ecuId: "8637C671",
      codingHex,
      crc: "1234",
      bom: true,
      fileName: "8637C671_MMEMCY1XXNH003447.kon_copy",
    });

    expect(saved.fileName).toBe("8637C671_MMEMCY1XXNH003447.kon");
    const buf = Buffer.from(saved.bytes, "base64");
    const parsed = parseKon(buf);
    expect(parsed.vin).toBe("MMEMCY1XXNH003447");
    expect(parsed.ecuId).toBe("8637C671");
    expect(parsed.codingHex).toBe(codingHex);
  });

  it("parses .kon files even if a trailing newline was appended", () => {
    const raw = writeKon({
      bom: true,
      vin: "MMEMCY1XXNH003447",
      date: "202610221200",
      ecuId: "8637C671",
      codingHex: "28820042",
      crc: "ABCD",
    });
    const withNewline = Buffer.concat([Buffer.from(raw), Buffer.from("\r\n")]);
    const parsed = parseKon(withNewline);
    expect(parsed.vin).toBe("MMEMCY1XXNH003447");
    expect(parsed.ecuId).toBe("8637C671");
  });
});
