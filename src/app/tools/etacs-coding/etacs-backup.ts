import {
  etacsDownloadNames,
  formatMutCodingContainer,
  type EtacsCodingDump,
} from "@/lib/obd/mitsubishi-etacs";
import { saveBlobToDevice } from "@/lib/platform/save-file";
import { bytesToHex } from "@/lib/obd/hex";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function backupFileName(originalName: string, tag: "original" | "before-write"): string {
  const base = originalName.replace(/\.(kon|cuf)$/i, "") || "coding";
  const ext = /\.cuf$/i.test(originalName) ? ".cuf" : ".kon";
  return `${base}.${tag}.${stamp()}${ext}`;
}

export async function saveOriginalFileBackup(
  bytes: Uint8Array,
  displayName: string,
): Promise<string> {
  const name = backupFileName(displayName, "original");
  await saveBlobToDevice(new Blob([Uint8Array.from(bytes)]), name);
  return name;
}

export async function saveEtacsDumpBackup(dump: EtacsCodingDump): Promise<{
  kon: string;
  cuf: string | null;
  json: string;
}> {
  const part = dump.partNumber ?? "8637C671";
  const vin = dump.vin ?? "UNKNOWNVIN0000000";
  const ts = stamp();
  const prefix = `${part}_${vin}_${ts}`;
  const names = etacsDownloadNames(prefix, { partNumber: part, vin });

  const now = new Date();
  const konBytes = formatMutCodingContainer({
    payload: dump.variant,
    partNumber: part,
    vin,
    timestamp: now,
  });
  await saveBlobToDevice(new Blob([Uint8Array.from(konBytes)]), names.kon);

  let cufName: string | null = null;
  if (dump.custom.length > 0) {
    const cufBytes = formatMutCodingContainer({
      payload: dump.custom,
      partNumber: part,
      vin,
      timestamp: now,
    });
    await saveBlobToDevice(new Blob([Uint8Array.from(cufBytes)]), names.cuf);
    cufName = names.cuf;
  }

  const backup = {
    timestamp: now.toISOString(),
    source: "qhub-etacs-coding-ecu-read",
    profileId: dump.profileId,
    tx: dump.txHex,
    rx: dump.rxHex,
    partNumber: dump.partNumber,
    swVersion: dump.swVersion ?? null,
    vin: dump.vin ?? null,
    variantUsedId: dump.variantUsedId ?? null,
    customUsedId: dump.customUsedId ?? null,
    variantHex: bytesToHex(dump.variant, ""),
    customHex: bytesToHex(dump.custom, ""),
  };
  await saveBlobToDevice(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    names.json,
  );

  return { kon: names.kon, cuf: cufName, json: names.json };
}
