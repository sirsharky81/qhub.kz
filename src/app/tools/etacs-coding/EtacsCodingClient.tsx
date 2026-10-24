"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EtacsDecodedRow, EtacsFileView } from "@/lib/etacs-coding/types";
import type { EtacsAccessCheckResult } from "@/lib/etacs-coding/licensing";
import {
  applyEtacsCoding,
  decodeEtacsCoding,
  fetchEtacsLicenseStatus,
  fetchEtacsStatus,
  parseEtacsFile,
  saveEtacsCoding,
} from "./api-client";
import {
  detectCodingExtension,
  ensureCodingFileName,
  saveCodingBytesAs,
  saveOriginalFileBackup,
} from "./etacs-backup";
import { PickerButton } from "../random-picker/components/PickerButton";
import { EtacsObdLink } from "./EtacsPageHeader";
import { EtacsHexDiffView } from "./EtacsHexDiffView";
import type { ObdTargetScenario } from "./EtacsBlockUploadPanel";
import { EtacsObdReadModal, EtacsObdWriteModal } from "./EtacsObdModals";
import {
  EtacsSaveFileModal,
  type EtacsSaveFileDialogRequest,
  type SaveDialogMethod,
} from "./EtacsSaveFileModal";
import { EtacsUnlockModal } from "./EtacsUnlockModal";
import {
  etacsDownloadNames,
  formatMutCodingContainer,
  type EtacsCodingDump,
} from "@/lib/obd/mitsubishi-etacs";

type Side = "a" | "b";

interface FileSlot {
  view: EtacsFileView | null;
  displayName: string;
  openedHex: string;
  openedLabels: Map<number, string>;
  fileHandle: FileSystemFileHandle | null;
  originalBytes: Uint8Array | null;
  backupSavedAt: string | null;
  loadSource: "disk" | "obd" | null;
}

function emptySlot(): FileSlot {
  return {
    view: null,
    displayName: "",
    openedHex: "",
    openedLabels: new Map(),
    fileHandle: null,
    originalBytes: null,
    backupSavedAt: null,
    loadSource: null,
  };
}

function formatHex(hex: string): string {
  const bytes = hex.match(/.{2}/g) ?? [];
  const lines: string[] = [];
  for (let index = 0; index < bytes.length; index += 16) {
    lines.push(bytes.slice(index, index + 16).join(" "));
  }
  return lines.join("\n");
}

function rowMap(view: EtacsFileView | null): Map<number, EtacsDecodedRow> {
  return new Map((view?.rows ?? []).map((row) => [row.id, row]));
}

function scenarioFromQuery(value: string | null): ObdTargetScenario {
  if (value === "engine_kon" || value === "etacs_cuf" || value === "etacs_kon") return value;
  return "etacs_kon";
}

export default function EtacsCodingClient() {
  const searchParams = useSearchParams();
  const [ready, setReady] = useState<boolean | null>(null);
  const [banner, setBanner] = useState("");
  const [slotA, setSlotA] = useState<FileSlot>(() => emptySlot());
  const [slotB, setSlotB] = useState<FileSlot>(() => emptySlot());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [compareChecked, setCompareChecked] = useState<Set<number>>(() => new Set());
  const [search, setSearch] = useState("");
  const [filterChanges, setFilterChanges] = useState(false);
  const [filterDiff, setFilterDiff] = useState(false);
  const [showRu, setShowRu] = useState(false);
  const [, setHexDraft] = useState("");
  const [readModalOpen, setReadModalOpen] = useState(false);
  const [writeModalOpen, setWriteModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<EtacsAccessCheckResult | null>(null);
  const [storedPromoCode, setStoredPromoCode] = useState<string>(() => {
    try {
      if (typeof window === "undefined") return "";
      return window.localStorage.getItem("qhub_etacs_promo_code") || "";
    } catch {
      return "";
    }
  });
  const [saveDialogRequest, setSaveDialogRequest] = useState<EtacsSaveFileDialogRequest | null>(
    null,
  );
  const [cufFallbackBytes, setCufFallbackBytes] = useState<Uint8Array | null>(null);
  const [cufFallbackName, setCufFallbackName] = useState<string>("");
  const [lastObdScenario, setLastObdScenario] = useState<ObdTargetScenario>(() =>
    scenarioFromQuery(searchParams.get("scenario")),
  );

  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);

  const [canShareFiles] = useState(() => {
    try {
      if (typeof navigator === "undefined" || !navigator.canShare) return false;
      const probe = new File([new Uint8Array(4)], "probe.kon", {
        type: "application/octet-stream",
      });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void fetchEtacsStatus()
      .then((s) => setReady(s.ready))
      .catch(() => setReady(false));
  }, []);

  const extKind = (name: string): "kon" | "cuf" | null => {
    if (/\.kon(?=$|[^a-zA-Z])/i.test(name)) return "kon";
    if (/\.cuf(?=$|[^a-zA-Z])/i.test(name)) return "cuf";
    return null;
  };

  const currentVin = slotA.view?.vin ?? "";
  const currentFileKind: "kon" | "cuf" =
    extKind(slotA.displayName) === "cuf" || slotA.view?.codingBytes === 65 ? "cuf" : "kon";

  const refreshLicenseStatus = useCallback(
    async (vinOverride?: string, codeOverride?: string, kindOverride?: "kon" | "cuf") => {
      try {
        const res = await fetchEtacsLicenseStatus({
          vin: vinOverride ?? currentVin,
          promoCode: codeOverride ?? storedPromoCode,
          fileKind: kindOverride ?? currentFileKind,
        });
        setLicenseStatus(res);
      } catch {
        /* ignore */
      }
    },
    [currentVin, storedPromoCode, currentFileKind],
  );

  useEffect(() => {
    void fetchEtacsLicenseStatus({
      vin: currentVin,
      promoCode: storedPromoCode,
      fileKind: currentFileKind,
    })
      .then((res) => setLicenseStatus(res))
      .catch(() => null);
  }, [currentVin, storedPromoCode, currentFileKind]);

  const handleSavePromoCode = useCallback(
    (code: string) => {
      setStoredPromoCode(code);
      try {
        if (typeof window !== "undefined") {
          if (code) window.localStorage.setItem("qhub_etacs_promo_code", code);
          else window.localStorage.removeItem("qhub_etacs_promo_code");
        }
      } catch {
        /* ignore */
      }
      void refreshLicenseStatus(currentVin, code, currentFileKind);
    },
    [refreshLicenseStatus, currentVin, currentFileKind],
  );

  const comparing = Boolean(
    slotA.view &&
      slotB.view &&
      slotA.view.codingBytes === slotB.view.codingBytes &&
      (!extKind(slotA.displayName) ||
        !extKind(slotB.displayName) ||
        extKind(slotA.displayName) === extKind(slotB.displayName)),
  );

  const editingLocked = useMemo(() => {
    if (slotA.loadSource !== "obd" || !slotA.view) return false;
    return !slotA.backupSavedAt;
  }, [slotA.loadSource, slotA.view, slotA.backupSavedAt]);

  const dirtyA = Boolean(slotA.view && slotA.view.codingHex !== slotA.openedHex);
  const dirtyB = Boolean(slotB.view && slotB.view.codingHex !== slotB.openedHex);
  const hasUnsavedEdits = dirtyA || dirtyB;

  const obdBackupHint = useMemo(() => {
    if (!editingLocked) return null;
    return "Прежде чем начать редактировать, сохраните выгруженный исходник .kon (и .cuf при считывании с ETACS).";
  }, [editingLocked]);

  const labelFor = useCallback(
    (side: Side, row: EtacsDecodedRow | undefined): string => {
      if (!row) return "";
      if (row.label) return row.label;
      const slot = side === "a" ? slotA : slotB;
      if (slot.view?.codingHex === slot.openedHex) {
        return slot.openedLabels.get(row.id) || "";
      }
      return row.baselineLabel || "";
    },
    [slotA, slotB],
  );

  const currentLabelA = useCallback(
    (row: EtacsDecodedRow): string => {
      if (row.label) return row.label;
      if (slotA.view?.codingHex === slotA.openedHex) {
        return slotA.openedLabels.get(row.id) || "";
      }
      if (slotA.view?.matchesBaseline) return row.baselineLabel || "";
      return "";
    },
    [slotA],
  );

  const refreshDecoded = useCallback(
    async (side: Side, rebuildOpened = false, codingHexOverride?: string) => {
      const slot = side === "a" ? slotA : slotB;
      const setSlot = side === "a" ? setSlotA : setSlotB;
      if (!slot.view) return;
      const codingHex = codingHexOverride ?? slot.view.codingHex;
      const body = await decodeEtacsCoding({
        vin: slot.view.vin,
        date: slot.view.date,
        ecuId: slot.view.ecuId,
        profileId: slot.view.profileId,
        fileName: slot.displayName,
        codingHex,
        crc: slot.view.crc,
        bom: slot.view.bom,
      });
      setSlot((prev) => {
        if (!prev.view) return prev;
        const nextLabels = new Map(prev.openedLabels);
        if (rebuildOpened && prev.view.codingHex === prev.openedHex) {
          nextLabels.clear();
          for (const row of body.rows) {
            nextLabels.set(row.id, row.label || row.baselineLabel || "");
          }
        }
        const nextView: EtacsFileView = {
          ...prev.view,
          codingHex,
          profileId: body.profileId || prev.view.profileId,
          model: body.model || prev.view.model,
          unit: body.unit || prev.view.unit,
          rows: body.rows,
          matchesBaseline: body.matchesBaseline,
          crcComputed: body.crcComputed,
          crcVerified: body.crcVerified,
          crc: body.crcComputed || prev.view.crc,
        };
        return { ...prev, openedLabels: nextLabels, view: nextView };
      });
    },
    [slotA, slotB],
  );

  const loadFile = useCallback(
    async (
      side: Side,
      file: File,
      fileHandle: FileSystemFileHandle | null,
      opts?: { loadSource?: "disk" | "obd"; backupSavedAt?: string | null },
    ) => {
      const detectedKind = extKind(file.name);
      if (!detectedKind) {
        setBanner("Нужен файл с расширением .kon или .cuf");
        return;
      }
      if (side === "b" && slotA.view) {
        const kA = extKind(slotA.displayName);
        const kB = detectedKind;
        if (kA && kB && kA !== kB) {
          setBanner(
            `Для сравнения нужен файл того же типа, что и A (.${kA} ↔ .${kA}), а не .kon и .cuf.`,
          );
          return;
        }
      }
      try {
        const originalBytes = new Uint8Array(await file.arrayBuffer());
        // Если имя файла было испорчено суффиксом после расширения (например, file.kon_copy),
        // нормализуем его, чтобы расширение стояло строго в конце.
        const cleanDisplayName = ensureCodingFileName(
          file.name,
          detectedKind === "cuf" ? ".cuf" : ".kon",
        );
        const normalizedFile =
          cleanDisplayName === file.name
            ? file
            : new File([originalBytes], cleanDisplayName, { type: "application/octet-stream" });
        const view = await parseEtacsFile(normalizedFile);
        const labels = new Map<number, string>();
        for (const row of view.rows) {
          labels.set(
            row.id,
            row.label || (view.matchesBaseline ? row.baselineLabel : "") || "",
          );
        }
        const loadSource = opts?.loadSource ?? "disk";
        const nextSlot: FileSlot = {
          view,
          displayName: cleanDisplayName,
          openedHex: view.codingHex,
          openedLabels: labels,
          fileHandle,
          originalBytes,
          backupSavedAt: opts?.backupSavedAt ?? null,
          loadSource,
        };
        if (side === "a") {
          setSlotA(nextSlot);
          setSelectedId(view.rows[0]?.id ?? null);
          setHexDraft(formatHex(view.codingHex));
        } else {
          setSlotB(nextSlot);
        }
        setBanner("");
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Не удалось открыть файл");
      }
    },
    [slotA.view, slotA.displayName],
  );

  const openFileInput = (side: Side) => {
    (side === "a" ? inputARef : inputBRef).current?.click();
  };

  const pickFile = async (side: Side) => {
    const openPicker = window.showOpenFilePicker;
    if (!window.isSecureContext || !openPicker) {
      openFileInput(side);
      return;
    }

    try {
      const [handle] = await openPicker({
        types: [
          {
            description: "Файлы кодировки Mitsubishi (.kon / .cuf)",
            accept: { "application/octet-stream": [".kon", ".cuf"] },
          },
        ],
        multiple: false,
      });
      let file: File;
      try {
        file = await handle.getFile();
      } catch {
        openFileInput(side);
        return;
      }
      await loadFile(side, file, handle);
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err?.name === "AbortError") return;
      if (/not allowed by the user agent|platform in the current context/i.test(err.message ?? "")) {
        openFileInput(side);
        return;
      }
      setBanner(error instanceof Error ? error.message : "Не удалось выбрать файл");
    }
  };

  const completeObdReadToEditor = useCallback(
    async (
      dump: EtacsCodingDump,
      scenario: ObdTargetScenario,
      savedNames?: { kon?: string; cuf?: string },
    ) => {
      setLastObdScenario(scenario);
      const part = dump.partNumber ?? (scenario === "engine_kon" ? "1860D362" : "8637C671");
      const vin = dump.vin ?? "UNKNOWNVIN0000000";
      const ts = new Date();
      const iso = ts.toISOString();
      const prefix = `${part}_${vin}_ecu`;
      const names = etacsDownloadNames(prefix, { partNumber: part, vin });
      const chosenKonName = savedNames?.kon || names.kon;
      const chosenCufName = savedNames?.cuf || names.cuf;

      if (scenario === "etacs_cuf") {
        const cufBytes = formatMutCodingContainer({
          payload: dump.custom,
          partNumber: part,
          vin,
          timestamp: ts,
        });
        await loadFile(
          "a",
          new File([Uint8Array.from(cufBytes)], chosenCufName, {
            type: "application/octet-stream",
          }),
          null,
          { loadSource: "obd", backupSavedAt: iso },
        );
        setCufFallbackBytes(null);
        setCufFallbackName("");
        setBanner("Custom Coding (.cuf) загружен в слот A. Слот B свободен для сравнения с другим .cuf.");
        return;
      }

      const konBytes = formatMutCodingContainer({
        payload: dump.variant,
        partNumber: part,
        vin,
        timestamp: ts,
      });
      await loadFile(
        "a",
        new File([Uint8Array.from(konBytes)], chosenKonName, {
          type: "application/octet-stream",
        }),
        null,
        { loadSource: "obd", backupSavedAt: iso },
      );

      if (scenario === "etacs_kon" && dump.custom.length > 0) {
        const cufBytes = formatMutCodingContainer({
          payload: dump.custom,
          partNumber: part,
          vin,
          timestamp: ts,
        });
        setCufFallbackBytes(new Uint8Array(cufBytes));
        setCufFallbackName(chosenCufName);
      } else {
        setCufFallbackBytes(null);
        setCufFallbackName("");
      }

      setBanner(
        scenario === "engine_kon"
          ? "Кодировка ЭБУ двигателя (.kon) загружена в слот A."
          : "Кодировка ETACS (.kon) загружена в слот A. Считанный .cuf сохранён в памяти для шага 2 при записи в блок.",
      );
    },
    [loadFile],
  );

  const performSaveEdited = async (
    side: Side,
    customFileName?: string,
    method: SaveDialogMethod = "download",
    force = false,
  ): Promise<void> => {
    const slot = side === "a" ? slotA : slotB;
    if (!slot.view) return;
    try {
      const ext = detectCodingExtension(slot.displayName);
      const requestedName = ensureCodingFileName(
        customFileName || slot.displayName || `coding_${side}${ext}`,
        ext,
      );
      const body = await saveEtacsCoding({
        force,
        vin: slot.view.vin,
        date: slot.view.date,
        ecuId: slot.view.ecuId,
        codingHex: slot.view.codingHex,
        crc: slot.view.crc,
        bom: slot.view.bom,
        fileName: requestedName,
        promoCode: storedPromoCode || undefined,
      });
      const bytes = Uint8Array.from(atob(body.bytes), (c) => c.charCodeAt(0));
      const targetName = ensureCodingFileName(body.fileName || requestedName, ext);

      let savedName = targetName;
      if (method === "overwrite" && slot.fileHandle) {
        const writable = await slot.fileHandle.createWritable();
        const copy = new Uint8Array(bytes);
        await writable.write(copy.buffer as ArrayBuffer);
        await writable.close();
        savedName = slot.fileHandle.name || targetName;
      } else {
        const effectiveMethod = method === "overwrite" ? "download" : method;
        savedName = await saveCodingBytesAs(bytes, targetName, effectiveMethod);
      }

      const setSlot = side === "a" ? setSlotA : setSlotB;
      setSlot((prev) =>
        prev.view
          ? {
              ...prev,
              openedHex: prev.view.codingHex,
              view: {
                ...prev.view,
                crc: body.crc,
                crcVerified: body.crcVerified,
              },
            }
          : prev,
      );
      setBanner(
        body.crcVerified
          ? `Файл ${side.toUpperCase()} сохранён как «${savedName}» (CRC ${body.crc}).`
          : `Файл ${side.toUpperCase()} сохранён как «${savedName}» с CRC ${body.crc} (сумма не подтверждена формулой).`,
      );
    } catch (error) {
      const err = error as Error & { status?: number; code?: string; name?: string };
      if (err?.name === "AbortError") throw err;
      if (err.status === 402 || err.code === "PAYMENT_REQUIRED") {
        setBanner(err.message || "Требуется активация доступа для этого VIN или ключ PRO");
        setUnlockModalOpen(true);
        throw err;
      }
      if (err.status === 409 && !force) {
        const agreed = window.confirm(`${err.message}\n\nСохранить всё равно?`);
        if (agreed) return performSaveEdited(side, customFileName, method, true);
        return;
      }
      setBanner(err.message || "Не удалось сохранить");
      throw err;
    }
  };

  const openSaveEditedDialog = (side: Side, preferShare = false): Promise<void> => {
    const slot = side === "a" ? slotA : slotB;
    if (!slot.view) return Promise.resolve();
    if (licenseStatus && licenseStatus.enforcePaywall && !licenseStatus.allowed) {
      setUnlockModalOpen(true);
      return Promise.resolve();
    }
    if (preferShare && canShareFiles) {
      return performSaveEdited(side, slot.displayName, "share");
    }
    return new Promise<void>((resolve) => {
      setSaveDialogRequest({
        side,
        mode: "edited",
        originalDisplayName: slot.displayName || `file_${side}.kon`,
        vin: slot.view?.vin,
        ecuId: slot.view?.ecuId,
        hasFileHandle: Boolean(slot.fileHandle),
        canShareFiles,
        onConfirm: async (finalFileName, method) => {
          await performSaveEdited(side, finalFileName, method);
          resolve();
        },
      });
    });
  };

  const openSaveOriginalDialog = (side: Side) => {
    const slot = side === "a" ? slotA : slotB;
    const setSlot = side === "a" ? setSlotA : setSlotB;
    if (!slot.originalBytes?.length) {
      setBanner("Сначала откройте файл");
      return;
    }
    setSaveDialogRequest({
      side,
      mode: "original",
      originalDisplayName: slot.displayName || `file_${side}.kon`,
      vin: slot.view?.vin,
      ecuId: slot.view?.ecuId,
      hasFileHandle: false,
      canShareFiles,
      onConfirm: async (finalFileName, method) => {
        const effectiveMethod = method === "overwrite" ? "download" : method;
        const name = await saveOriginalFileBackup(
          slot.originalBytes!,
          slot.displayName || `file_${side}.kon`,
          finalFileName,
          effectiveMethod,
        );
        const at = new Date().toISOString();
        setSlot((s) => ({ ...s, backupSavedAt: at }));
        setBanner(`Сохранён оригинал ${side.toUpperCase()}: «${name}»`);
      },
    });
  };

  const closeSlotWithPrompt = async (side: Side) => {
    const slot = side === "a" ? slotA : slotB;
    if (!slot.view) return;
    const dirty = slot.view.codingHex !== slot.openedHex;
    if (dirty) {
      const wantSave = window.confirm(
        `В файле ${side.toUpperCase()} (${slot.displayName}) есть несохранённые изменения.\n\nНажмите «ОК», чтобы открыть сохранение файла, или «Отмена», чтобы закрыть без сохранения.`,
      );
      if (wantSave) {
        await openSaveEditedDialog(side);
        return;
      }
      if (!window.confirm("Закрыть файл без сохранения изменений?")) {
        return;
      }
    } else if (!window.confirm(`Закрыть файл ${side.toUpperCase()} (${slot.displayName})?`)) {
      return;
    }
    if (side === "a") {
      setSlotA(emptySlot());
      setSelectedId(null);
      setHexDraft("");
      setCompareChecked(new Set());
    } else {
      setSlotB(emptySlot());
      setCompareChecked(new Set());
    }
  };

  const applyLabel = async (side: Side, id: number, label: string) => {
    if (editingLocked) {
      setBanner("Сначала сохраните выгруженные исходники (.kon и .cuf).");
      return;
    }
    const slot = side === "a" ? slotA : slotB;
    const setSlot = side === "a" ? setSlotA : setSlotB;
    if (!slot.view) return;
    const result = await applyEtacsCoding({
      ecuId: slot.view.ecuId,
      profileId: slot.view.profileId,
      id,
      label,
      codingHex: slot.view.codingHex,
    });
    setSlot((prev) => {
      if (!prev.view) return prev;
      return {
        ...prev,
        view: {
          ...prev.view,
          codingHex: result.codingHex,
          crc: result.crc || prev.view.crc,
          crcComputed: result.crc,
          crcVerified: result.crcVerified,
        },
      };
    });
    if (side === "a") setHexDraft(formatHex(result.codingHex));
    await refreshDecoded(side, false, result.codingHex);
  };

  const copyParameter = async (from: Side, to: Side, id: number) => {
    if (editingLocked) return;
    if (!comparing) return;
    const fromRow = rowMap(from === "a" ? slotA.view : slotB.view).get(id);
    const toSlot = to === "a" ? slotA : slotB;
    if (!fromRow || !toSlot.view) return;
    const label = labelFor(from, fromRow);
    if (!label) {
      setBanner(`У параметра ${id} нет значения в файле ${from.toUpperCase()}.`);
      return;
    }
    const targetRow = rowMap(toSlot.view).get(id);
    if (!targetRow?.editable && !targetRow?.options?.length) {
      setBanner(`Параметр ${id} нельзя изменить в файле ${to.toUpperCase()}.`);
      return;
    }
    try {
      await applyLabel(to, id, label);
      setCompareChecked((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Ошибка apply");
    }
  };

  const mergedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of slotA.view?.rows ?? []) ids.add(row.id);
    for (const row of slotB.view?.rows ?? []) ids.add(row.id);
    return [...ids].sort((a, b) => a - b);
  }, [slotA.view, slotB.view]);

  const diffCount = useMemo(() => {
    if (!comparing) return 0;
    let diffs = 0;
    const mapA = rowMap(slotA.view);
    const mapB = rowMap(slotB.view);
    for (const id of mergedIds) {
      const a = labelFor("a", mapA.get(id));
      const b = labelFor("b", mapB.get(id));
      if (a !== b) diffs++;
    }
    return diffs;
  }, [comparing, mergedIds, slotA.view, slotB.view, labelFor]);

  const changedACount = useMemo(() => {
    if (!slotA.view) return 0;
    let count = 0;
    const mapA = rowMap(slotA.view);
    for (const id of mergedIds) {
      const row = mapA.get(id);
      if (!row) continue;
      const opened = slotA.openedLabels.get(id) || "";
      const current = currentLabelA(row);
      if (Boolean(opened) && current !== opened) count++;
    }
    return count;
  }, [slotA, mergedIds, currentLabelA]);

  const bannerParts = useMemo(() => {
    const file = slotA.view;
    if (!file) return [];
    const parts: string[] = [];
    if (comparing) {
      parts.push(`Сравнение A ↔ B: отличий — ${diffCount}.`);
    }
    if (file.readOnly) {
      parts.push(
        file.statusNote ||
          `Блок ${file.ecuId} (${file.model || "Outlander"}) — только просмотр.`,
      );
    } else if (!file.hasDictionary) {
      parts.push(`Для ECU ${file.ecuId} справочник не найден.`);
    } else if (!file.masksComplete) {
      parts.push("Справочник неполный: часть параметров нельзя менять.");
    }
    if (!file.copiesMatch) parts.push("Две копии блока в файле различаются.");
    return parts;
  }, [slotA.view, comparing, diffCount]);

  const visibleRows = useMemo(() => {
    if (!slotA.view) return [];
    const mapA = rowMap(slotA.view);
    const mapB = rowMap(slotB.view);
    const query = search.trim().toLowerCase();
    return mergedIds.filter((id) => {
      const row = mapA.get(id) || mapB.get(id);
      if (!row) return false;
      const name = row.name ?? `Параметр ${id}`;
      const nameRu = row.nameRu ?? "";
      if (
        query &&
        !name.toLowerCase().includes(query) &&
        !nameRu.toLowerCase().includes(query) &&
        !String(id).includes(query)
      ) {
        return false;
      }
      const opened = slotA.openedLabels.get(id) || "";
      const current = currentLabelA(mapA.get(id) || { ...row, id, label: null, baselineLabel: "" });
      const changedA = Boolean(opened) && current !== opened;
      const valA = labelFor("a", mapA.get(id));
      const valB = labelFor("b", mapB.get(id));
      const diff = comparing && valA !== valB;
      if (filterChanges && !changedA) return false;
      if (filterDiff && !diff) return false;
      return true;
    });
  }, [
    slotA,
    slotB,
    mergedIds,
    search,
    filterChanges,
    filterDiff,
    comparing,
    labelFor,
    currentLabelA,
  ]);

  const selectedRow = slotA.view?.rows.find((r) => r.id === selectedId);

  const buildFileBytes = useCallback(
    async (slot: FileSlot): Promise<Uint8Array> => {
      if (!slot.view) throw new Error("Файл не открыт");
      try {
        const body = await saveEtacsCoding({
          force: true,
          vin: slot.view.vin,
          date: slot.view.date,
          ecuId: slot.view.ecuId,
          codingHex: slot.view.codingHex,
          crc: slot.view.crc,
          bom: slot.view.bom,
          fileName: slot.displayName || undefined,
          promoCode: storedPromoCode || undefined,
        });
        return Uint8Array.from(atob(body.bytes), (c) => c.charCodeAt(0));
      } catch (err) {
        const e = err as Error & { status?: number; code?: string };
        if (e.status === 402 || e.code === "PAYMENT_REQUIRED") {
          setUnlockModalOpen(true);
        }
        throw err;
      }
    },
    [storedPromoCode],
  );

  const getCurrentBytesA = useCallback(() => buildFileBytes(slotA), [buildFileBytes, slotA]);
  const getCurrentBytesB = useCallback(async () => {
    if (!slotB.view) return null;
    return buildFileBytes(slotB);
  }, [buildFileBytes, slotB]);

  const writeScenario = useMemo<ObdTargetScenario>(() => {
    if (!slotA.view) return lastObdScenario;
    if (extKind(slotA.displayName) === "cuf") return "etacs_cuf";
    const ecuUpper = (slotA.view.ecuId || "").toUpperCase();
    const unitLower = (slotA.view.unit || "").toLowerCase();
    if (
      lastObdScenario === "engine_kon" ||
      ecuUpper.startsWith("1860") ||
      unitLower.includes("engine") ||
      unitLower.includes("ecm") ||
      unitLower.includes("двс")
    ) {
      return "engine_kon";
    }
    return "etacs_kon";
  }, [slotA.view, slotA.displayName, lastObdScenario]);

  const slotSummary = (side: Side) => {
    const slot = side === "a" ? slotA : slotB;
    return {
      displayName: slot.displayName,
      originalBytes: slot.originalBytes,
      backupSavedAt: slot.backupSavedAt,
      hasFile: Boolean(slot.view),
      loadSource: slot.loadSource,
    };
  };

  if (ready === false) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          Справочник на сервере временно недоступен. Задайте{" "}
          <code className="rounded bg-white px-1 text-xs">ETACS_DICTIONARY_DIR</code> на VPS. Запись с блока возможна
          через{" "}
          <EtacsObdLink />.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col px-2.5 pb-4 pt-2 sm:px-4">
        <div
          className={[
            "app-shell etacs-editor-frame rounded-xl border border-gray-200 shadow-sm",
            comparing ? "mode-compare" : slotA.view ? "mode-single" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {editingLocked ? (
            <section className="banner border-amber-300 bg-amber-50 text-amber-950">
              {obdBackupHint}
            </section>
          ) : null}

          <header className="etacs-files-header">
            <div className={`file-slots ${slotB.view ? "file-slots-two" : "file-slots-one"}`}>
              {/* СЛОТ A */}
              <div className="file-slot">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="slot-label">Файл A (.kon / .cuf)</span>
                    {dirtyA ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        Изменён ({changedACount})
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {slotA.backupSavedAt ? (
                      <button
                        type="button"
                        onClick={() => openSaveOriginalDialog("a")}
                        className="slot-backup hover:underline whitespace-nowrap"
                        title="Сохранить оригинал повторно под другим именем"
                      >
                        ✓ Оригинал ({new Date(slotA.backupSavedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })})
                      </button>
                    ) : slotA.originalBytes ? (
                      <button
                        type="button"
                        className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap"
                        onClick={() => openSaveOriginalDialog("a")}
                      >
                        Сохранить оригинал…
                      </button>
                    ) : null}
                  </div>
                </div>

                {slotA.displayName ? (
                  <div className="slot-name" title={slotA.displayName}>
                    {slotA.displayName}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400">
                    Файл не выбран — откройте .kon / .cuf или считайте с блока
                  </div>
                )}

                <div className="slot-row">
                  <PickerButton
                    variant="primary"
                    className="!px-2.5 !py-1 !text-[11.5px] !rounded-md"
                    onClick={() => void pickFile("a")}
                  >
                    Открыть
                  </PickerButton>
                  <PickerButton
                    variant="secondary"
                    className="!px-2.5 !py-1 !text-[11.5px] !rounded-md"
                    onClick={() => setReadModalOpen(true)}
                  >
                    Выгрузить с блока
                  </PickerButton>
                  <PickerButton
                    variant="secondary"
                    className="!px-2.5 !py-1 !text-[11.5px] !rounded-md"
                    disabled={!slotA.view}
                    onClick={() => {
                      if (licenseStatus && licenseStatus.enforcePaywall && !licenseStatus.allowed) {
                        setUnlockModalOpen(true);
                        return;
                      }
                      setWriteModalOpen(true);
                    }}
                  >
                    Загрузить в блок
                  </PickerButton>
                  <PickerButton
                    variant={dirtyA ? "primary" : "secondary"}
                    className="!px-2.5 !py-1 !text-[11.5px] !rounded-md"
                    disabled={!slotA.view}
                    onClick={() => void openSaveEditedDialog("a")}
                  >
                    Сохранить как…
                  </PickerButton>
                  {canShareFiles ? (
                    <PickerButton
                      variant="ghost"
                      className="!px-2 !py-1 !text-[11.5px] !rounded-md"
                      disabled={!slotA.view}
                      onClick={() => void openSaveEditedDialog("a", true)}
                    >
                      Поделиться
                    </PickerButton>
                  ) : null}
                  {slotA.view ? (
                    <PickerButton
                      variant="ghost"
                      className="!px-2 !py-1 !text-[11.5px] !rounded-md"
                      onClick={() => void closeSlotWithPrompt("a")}
                    >
                      Закрыть
                    </PickerButton>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setUnlockModalOpen(true)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                      licenseStatus?.reason === "vin_unlocked_full" ||
                      licenseStatus?.reason === "vin_unlocked_cuf" ||
                      licenseStatus?.reason === "pro_code" ||
                      licenseStatus?.reason === "admin"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        : licenseStatus?.enforcePaywall && !licenseStatus?.allowed
                          ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                    title="Проверить доступ по VIN (.cuf / .kon) или ввести код активации"
                  >
                    {licenseStatus?.reason === "pro_code"
                      ? "★ PRO активен"
                      : licenseStatus?.reason === "vin_unlocked_full"
                        ? "✓ VIN (.kon + .cuf)"
                        : licenseStatus?.reason === "vin_unlocked_cuf"
                          ? "✓ VIN (.cuf открыт)"
                          : licenseStatus?.reason === "cuf_only_need_kon_upgrade"
                            ? "🔒 Открыть .kon"
                            : licenseStatus?.reason === "admin"
                              ? "★ Admin PRO"
                              : licenseStatus?.enforcePaywall
                                ? `🔒 Открыть ${currentFileKind === "cuf" ? ".cuf" : ".kon"} / PRO`
                                : "🔑 Тарифы / PRO"}
                  </button>
                  {!slotB.view ? (
                    <PickerButton
                      variant="secondary"
                      className="sm:ml-auto !border-blue-200 !bg-blue-50/80 !px-2.5 !py-1 !text-[11.5px] !rounded-md !text-blue-800 hover:!bg-blue-100"
                      onClick={() => void pickFile("b")}
                    >
                      + Файл B (сравн.)
                    </PickerButton>
                  ) : null}
                  <input
                    ref={inputARef}
                    type="file"
                    hidden
                    accept=".kon,.cuf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void loadFile("a", file, null);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={inputBRef}
                    type="file"
                    hidden
                    accept=".kon,.cuf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void loadFile("b", file, null);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              {/* СЛОТ B */}
              {slotB.view ? (
                <div className="file-slot file-slot-b">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="slot-label">
                        Файл B{" "}
                        {slotA.view && extKind(slotA.displayName)
                          ? `(.${extKind(slotA.displayName)} ↔ .${extKind(slotA.displayName)})`
                          : "(сравн.)"}
                      </span>
                      {dirtyB ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          Изменён
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {slotB.backupSavedAt ? (
                        <button
                          type="button"
                          onClick={() => openSaveOriginalDialog("b")}
                          className="slot-backup hover:underline whitespace-nowrap"
                          title="Сохранить оригинал повторно под другим именем"
                        >
                          ✓ Оригинал ({new Date(slotB.backupSavedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })})
                        </button>
                      ) : slotB.originalBytes ? (
                        <button
                          type="button"
                          className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap"
                          onClick={() => openSaveOriginalDialog("b")}
                        >
                          Сохранить оригинал…
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="slot-name" title={slotB.displayName}>
                    {slotB.displayName}
                  </div>

                  <div className="slot-row">
                    <PickerButton
                      variant="primary"
                      className="!px-2.5 !py-1 !text-[11.5px] !rounded-md"
                      onClick={() => void pickFile("b")}
                    >
                      Открыть другой
                    </PickerButton>
                    <PickerButton
                      variant={dirtyB ? "primary" : "secondary"}
                      className="!px-2.5 !py-1 !text-[11.5px] !rounded-md"
                      disabled={!slotB.view}
                      onClick={() => void openSaveEditedDialog("b")}
                    >
                      Сохранить как…
                    </PickerButton>
                    {canShareFiles ? (
                      <PickerButton
                        variant="ghost"
                        className="!px-2 !py-1 !text-[11.5px] !rounded-md"
                        disabled={!slotB.view}
                        onClick={() => void openSaveEditedDialog("b", true)}
                      >
                        Поделиться
                      </PickerButton>
                    ) : null}
                    <PickerButton
                      variant="ghost"
                      className="!px-2 !py-1 !text-[11.5px] !rounded-md"
                      disabled={!slotB.view}
                      onClick={() => void closeSlotWithPrompt("b")}
                    >
                      Закрыть B
                    </PickerButton>
                  </div>
                </div>
              ) : null}
            </div>
          </header>

          {banner || bannerParts.length > 0 ? (
            <section className="banner">{banner || bannerParts.join(" ")}</section>
          ) : null}

          {slotA.view ? (
            <section className="etacs-meta-strip">
              <div className="etacs-meta-row">
                <span className="etacs-meta-badge">A</span>
                <span className="etacs-meta-cell">
                  <em className="text-gray-400 not-italic">VIN:</em>{" "}
                  <strong className="font-mono">{slotA.view.vin || "—"}</strong>
                </span>
                <span className="etacs-meta-cell">
                  <em className="text-gray-400 not-italic">ECU:</em>{" "}
                  <strong className="font-mono">
                    {[slotA.view.ecuId, slotA.view.model, slotA.view.unit].filter(Boolean).join(" · ") ||
                      slotA.view.ecuId}
                  </strong>
                </span>
                <span className="etacs-meta-cell">
                  <em className="text-gray-400 not-italic">Дата:</em>{" "}
                  <strong className="font-mono">{slotA.view.date || "—"}</strong>
                </span>
                <span className="etacs-meta-cell">
                  <em className="text-gray-400 not-italic">CRC:</em>{" "}
                  <strong className={`font-mono ${slotA.view.crcVerified ? "text-emerald-700" : "text-amber-700"}`}>
                    {slotA.view.crcComputed && slotA.view.crc !== slotA.view.crcComputed
                      ? `${slotA.view.crc} → ${slotA.view.crcComputed}`
                      : slotA.view.crc}
                  </strong>
                </span>
              </div>

              {comparing && slotB.view ? (
                <div className="etacs-meta-row">
                  <span className="etacs-meta-badge etacs-meta-badge-b">B</span>
                  <span className="etacs-meta-cell">
                    <em className="text-gray-400 not-italic">VIN:</em>{" "}
                    <strong className="font-mono">{slotB.view.vin || "—"}</strong>
                  </span>
                  <span className="etacs-meta-cell">
                    <em className="text-gray-400 not-italic">ECU:</em>{" "}
                    <strong className="font-mono">
                      {[slotB.view.ecuId, slotB.view.model, slotB.view.unit].filter(Boolean).join(" · ") ||
                        slotB.view.ecuId}
                    </strong>
                  </span>
                  <span className="etacs-meta-cell">
                    <em className="text-gray-400 not-italic">Дата:</em>{" "}
                    <strong className="font-mono">{slotB.view.date || "—"}</strong>
                  </span>
                  <span className="etacs-meta-cell">
                    <em className="text-gray-400 not-italic">CRC:</em>{" "}
                    <strong className={`font-mono ${slotB.view.crcVerified ? "text-emerald-700" : "text-amber-700"}`}>
                      {slotB.view.crc}
                    </strong>
                  </span>
                </div>
              ) : null}
            </section>
          ) : null}

          <main className={`work-area ${editingLocked ? "etacs-editing-locked" : ""}`}>
            <section className="grid-wrap">
              {slotA.view ? (
                <EtacsHexDiffView
                  openedHex={slotA.openedHex}
                  currentHex={slotA.view.codingHex}
                  selectedByteIndices={selectedRow?.byteIndices}
                  selectedParamId={selectedRow?.id}
                  selectedParamName={selectedRow?.name}
                  selectedParamNameRu={selectedRow?.nameRu ?? undefined}
                  editingLocked={editingLocked}
                  onManualHexChange={async (raw) => {
                    if (editingLocked) return;
                    const codingHex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
                    setHexDraft(raw);
                    const expected = slotA.openedHex.length;
                    if (codingHex.length !== expected) return;
                    setSlotA((prev) =>
                      prev.view
                        ? {
                            ...prev,
                            view: {
                              ...prev.view,
                              codingHex,
                              crcVerified: false,
                            },
                          }
                        : prev,
                    );
                    await refreshDecoded("a");
                  }}
                />
              ) : null}

              <div className="toolbar">
                <input
                  id="search"
                  type="search"
                  placeholder="Поиск параметра (EN / RU / #)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="row-count">
                  {slotA.view
                    ? visibleRows.length === mergedIds.length
                      ? `${mergedIds.length} пар.`
                      : `${visibleRows.length} / ${mergedIds.length}`
                    : ""}
                </span>
                <label className="chk" title="Показать только изменённые параметры в файле A">
                  <input
                    type="checkbox"
                    checked={filterChanges}
                    onChange={(e) => setFilterChanges(e.target.checked)}
                  />{" "}
                  Изм. A{changedACount > 0 ? ` (${changedACount})` : ""}
                </label>
                {comparing ? (
                  <label className="chk" title="Показать только отличия между файлами A и B">
                    <input
                      type="checkbox"
                      checked={filterDiff}
                      onChange={(e) => setFilterDiff(e.target.checked)}
                    />{" "}
                    Отличия ({diffCount})
                  </label>
                ) : null}
                <label
                  className="chk"
                  title="Включить русские названия параметров и значений в таблице"
                >
                  <input
                    type="checkbox"
                    checked={showRu}
                    onChange={(e) => setShowRu(e.target.checked)}
                  />{" "}
                  RU перевод
                </label>
                {comparing ? (
                  <div className="bulk-actions flex flex-wrap gap-1.5">
                    <PickerButton
                      variant="secondary"
                      className="!px-2.5 !py-1 !text-[11px]"
                      disabled={compareChecked.size === 0}
                      onClick={() => {
                        for (const id of compareChecked) void copyParameter("b", "a", id);
                      }}
                    >
                      Отмеченное B → A {compareChecked.size > 0 ? `(${compareChecked.size})` : ""}
                    </PickerButton>
                    <PickerButton
                      variant="secondary"
                      className="!px-2.5 !py-1 !text-[11px]"
                      disabled={compareChecked.size === 0}
                      onClick={() => {
                        for (const id of compareChecked) void copyParameter("a", "b", id);
                      }}
                    >
                      Отмеченное A → B {compareChecked.size > 0 ? `(${compareChecked.size})` : ""}
                    </PickerButton>
                  </div>
                ) : null}
              </div>

              {/* МОБИЛЬНЫЙ ВИД: удобные карточки с полными названиями и значениями без урезания */}
              <div className="divide-y divide-gray-200 md:hidden">
                {!slotA.view ? (
                  <div className="px-4 py-10 text-center text-xs text-gray-500">
                    Откройте файл <code className="font-mono">.kon</code> / <code className="font-mono">.cuf</code> в слот A или нажмите «Выгрузить с блока».
                  </div>
                ) : visibleRows.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-gray-500">
                    Нет параметров, подходящих под фильтр.
                  </div>
                ) : (
                  visibleRows.map((id) => {
                    const mapA = rowMap(slotA.view);
                    const mapB = rowMap(slotB.view);
                    const row = mapA.get(id) || mapB.get(id)!;
                    const rowA = mapA.get(id);
                    const rowB = mapB.get(id);
                    const valA = labelFor("a", rowA);
                    const valB = labelFor("b", rowB);
                    const diff = comparing && valA !== valB;
                    const opened = slotA.openedLabels.get(id) || "";
                    const current = currentLabelA(rowA || row);
                    const changedA = Boolean(opened) && current !== opened;
                    const nameRu = row.nameRu ?? "";
                    const hasDistinctRu = Boolean(
                      nameRu && nameRu.toLowerCase() !== row.name.toLowerCase(),
                    );
                    const currentRu =
                      current && rowA?.optionsRu?.[current] ? rowA.optionsRu[current] : "";
                    const openedRu =
                      opened && rowA?.optionsRu?.[opened] ? rowA.optionsRu[opened] : "";
                    const valBRu =
                      valB && (rowB?.optionsRu?.[valB] || rowA?.optionsRu?.[valB])
                        ? rowB?.optionsRu?.[valB] || rowA?.optionsRu?.[valB]
                        : "";

                    const formatMobileLabel = (rawLabel: string, ruLabel?: string) => {
                      if (!rawLabel) return "—";
                      if (ruLabel && ruLabel.toLowerCase() !== rawLabel.toLowerCase()) {
                        return showRu ? `${ruLabel} (${rawLabel})` : `${rawLabel} · ${ruLabel}`;
                      }
                      return rawLabel;
                    };

                    const isSelected = id === selectedId;

                    return (
                      <div
                        key={id}
                        onClick={() => {
                          if (!editingLocked) setSelectedId(id);
                        }}
                        className={[
                          "mobile-param-card p-3 transition-colors",
                          isSelected
                            ? "bg-emerald-50/80"
                            : diff
                              ? "bg-blue-50/60"
                              : changedA
                                ? "bg-amber-50/50"
                                : "bg-white",
                        ].join(" ")}
                      >
                        {/* Заголовок параметра: полный текст EN и RU без многоточий */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            {comparing && diff ? (
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
                                checked={compareChecked.has(id)}
                                onChange={(e) => {
                                  setCompareChecked((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(id);
                                    else next.delete(id);
                                    return next;
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : null}
                            <span className="inline-flex shrink-0 items-center rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-gray-600">
                              #{id}
                            </span>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold leading-snug text-gray-900 break-words">
                                {showRu && hasDistinctRu ? nameRu : row.name}
                                {row.outsideMut ? (
                                  <span className="ml-1.5 rounded bg-gray-200 px-1 py-0.5 text-[10px] font-normal text-gray-700">
                                    вне MUT
                                  </span>
                                ) : null}
                              </div>
                              {hasDistinctRu ? (
                                <div className="mt-0.5 text-[11.5px] leading-snug text-gray-500 break-words">
                                  {showRu ? row.name : nameRu}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {changedA ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                Изм. A
                              </span>
                            ) : null}
                            {diff ? (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-900">
                                A ≠ B
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Поле выбора значения A */}
                        <div className="mt-2.5">
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-[11px] text-gray-500">
                            <span className="font-medium text-gray-700">
                              {comparing ? "Файл A (редактируемый):" : "Значение сейчас:"}
                            </span>
                            {changedA ? (
                              <span className="text-amber-800">
                                Было: <strong className="font-mono">{formatMobileLabel(opened, openedRu)}</strong>
                              </span>
                            ) : (
                              <span className="text-gray-400">
                                Исходное: {opened || "—"}
                              </span>
                            )}
                          </div>

                          {rowA?.editable && (rowA.options.length ?? 0) > 0 ? (
                            <select
                              className="mobile-value-select"
                              disabled={editingLocked}
                              value={current || rowA.options[0] || ""}
                              onFocus={() => setSelectedId(id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(id);
                              }}
                              onChange={(e) => {
                                setSelectedId(id);
                                void applyLabel("a", id, e.target.value).catch((err) =>
                                  setBanner(err instanceof Error ? err.message : "Ошибка"),
                                );
                              }}
                            >
                              {rowA.options.map((label) => {
                                const ru = rowA.optionsRu?.[label];
                                const hasRu = Boolean(
                                  ru && ru.toLowerCase() !== label.toLowerCase(),
                                );
                                return (
                                  <option key={label} value={label}>
                                    {hasRu
                                      ? showRu
                                        ? `${ru} (${label})`
                                        : `${label} — ${ru}`
                                      : label}
                                  </option>
                                );
                              })}
                            </select>
                          ) : (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-800 break-words">
                              {formatMobileLabel(current || valA, currentRu)}
                            </div>
                          )}
                        </div>

                        {/* В режиме сравнения: блок значения B и быстрые кнопки переноса */}
                        {comparing ? (
                          <div
                            className={`mt-2 rounded-lg border px-2.5 py-2 text-xs ${
                              diff
                                ? "border-blue-200 bg-white"
                                : "border-gray-200/80 bg-gray-50/70"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-blue-800">
                                  Файл B:
                                </span>{" "}
                                <span
                                  className={`font-medium break-words ${
                                    diff ? "text-blue-950 font-semibold" : "text-gray-700"
                                  }`}
                                >
                                  {formatMobileLabel(valB, valBRu)}
                                </span>
                              </div>
                              {diff ? (
                                <div
                                  className="flex items-center gap-1.5 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <PickerButton
                                    variant="secondary"
                                    className="!px-2.5 !py-1 !text-[11px] !font-semibold !border-blue-300 !bg-blue-50 !text-blue-900"
                                    onClick={() => void copyParameter("b", "a", id)}
                                  >
                                    Взять из B → A
                                  </PickerButton>
                                  <PickerButton
                                    variant="secondary"
                                    className="!px-2 !py-1 !text-[11px]"
                                    onClick={() => void copyParameter("a", "b", id)}
                                  >
                                    A → B
                                  </PickerButton>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              {/* ДЕСКТОПНЫЙ ВИД: таблица с фиксированной шапкой */}
              <div className="table-scroll hidden md:block">
                <table>
                  <thead>
                    <tr>
                      {comparing ? <th className="col-check" /> : null}
                      <th className="col-id">#</th>
                      <th className="col-name">Параметр</th>
                      <th className="col-was">{comparing ? "Файл A (редакт.)" : "Было"}</th>
                      {comparing ? <th className="col-val-b">Файл B</th> : null}
                      {!comparing ? <th className="col-now">Сейчас</th> : null}
                      {comparing ? <th className="row-actions" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {!slotA.view ? (
                      <tr>
                        <td colSpan={comparing ? 6 : 4} className="!py-8 text-center text-xs text-gray-500">
                          Откройте файл .kon / .cuf в слот A или нажмите «Выгрузить с блока».
                        </td>
                      </tr>
                    ) : null}
                    {visibleRows.map((id) => {
                      const mapA = rowMap(slotA.view);
                      const mapB = rowMap(slotB.view);
                      const row = mapA.get(id) || mapB.get(id)!;
                      const valA = labelFor("a", mapA.get(id));
                      const valB = labelFor("b", mapB.get(id));
                      const diff = comparing && valA !== valB;
                      const opened = slotA.openedLabels.get(id) || "";
                      const current = currentLabelA(mapA.get(id) || row);
                      const changedA = Boolean(opened) && current !== opened;
                      const nameRu = row.nameRu ?? "";
                      const hasDistinctRu = Boolean(nameRu && nameRu.toLowerCase() !== row.name.toLowerCase());
                      const displayParamName = showRu && hasDistinctRu ? nameRu : row.name;
                      const nameText = row.outsideMut ? `${displayParamName} — вне MUT` : displayParamName;
                      const tooltipLines = [
                        hasDistinctRu ? `${row.name} — ${nameRu}` : row.name,
                        row.detail,
                      ].filter(Boolean);

                      const rowA = mapA.get(id);
                      const rowB = mapB.get(id);
                      const currentRu = current && rowA?.optionsRu?.[current] ? rowA.optionsRu[current] : "";
                      const openedRu = opened && rowA?.optionsRu?.[opened] ? rowA.optionsRu[opened] : "";
                      const valBRu =
                        valB && (rowB?.optionsRu?.[valB] || rowA?.optionsRu?.[valB])
                          ? rowB?.optionsRu?.[valB] || rowA?.optionsRu?.[valB]
                          : "";

                      const formatCellLabel = (rawLabel: string, ruLabel?: string) => {
                        if (!rawLabel) return "—";
                        if (showRu && ruLabel && ruLabel.toLowerCase() !== rawLabel.toLowerCase()) {
                          return ruLabel;
                        }
                        return rawLabel;
                      };

                      const selectA =
                        rowA?.editable && (rowA.options.length ?? 0) > 0 ? (
                          <select
                            className="value-select"
                            disabled={editingLocked}
                            value={current || rowA.options[0] || ""}
                            title={
                              currentRu && currentRu.toLowerCase() !== current.toLowerCase()
                                ? `${current} — ${currentRu}`
                                : current || undefined
                            }
                            onFocus={() => setSelectedId(id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(id);
                            }}
                            onChange={(e) => {
                              setSelectedId(id);
                              void applyLabel("a", id, e.target.value).catch((err) =>
                                setBanner(err instanceof Error ? err.message : "Ошибка"),
                              );
                            }}
                          >
                            {rowA.options.map((label) => {
                              const ru = rowA.optionsRu?.[label];
                              const hasRu = Boolean(ru && ru.toLowerCase() !== label.toLowerCase());
                              return (
                                <option
                                  key={label}
                                  value={label}
                                  title={hasRu ? `${label} — ${ru}` : label}
                                >
                                  {showRu && hasRu ? `${ru} (${label})` : label}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <span>{formatCellLabel(current || valA, currentRu)}</span>
                        );

                      return (
                        <tr
                          key={id}
                          className={[
                            id === selectedId ? "selected" : "",
                            changedA ? "changed" : "",
                            diff ? "diff" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            if (editingLocked) return;
                            setSelectedId(id);
                          }}
                        >
                          {comparing ? (
                            <td className="col-check">
                              {diff ? (
                                <input
                                  type="checkbox"
                                  checked={compareChecked.has(id)}
                                  onChange={(e) => {
                                    setCompareChecked((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(id);
                                      else next.delete(id);
                                      return next;
                                    });
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : null}
                            </td>
                          ) : null}
                          <td className="col-id">{id}</td>
                          <td className="col-name" title={tooltipLines.join("\n")}>
                            <span>{nameText}</span>
                            {!showRu && hasDistinctRu ? (
                              <span className="etacs-row-ru-hint"> · {nameRu}</span>
                            ) : null}
                          </td>
                          {comparing ? (
                            <>
                              <td
                                className="val-a cell-value"
                                title={
                                  [
                                    currentRu ? `${current} — ${currentRu}` : current,
                                    opened ? `Было при открытии A: ${opened}` : "",
                                  ]
                                    .filter(Boolean)
                                    .join("\n") || undefined
                                }
                              >
                                {selectA}
                              </td>
                              <td
                                className="val-b cell-value"
                                title={valBRu ? `${valB} — ${valBRu}` : valB || undefined}
                              >
                                {formatCellLabel(valB, valBRu)}
                              </td>
                              <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                                {diff ? (
                                  <>
                                    <PickerButton
                                      variant="secondary"
                                      className="!px-1.5 !py-0 text-[10px] mr-1"
                                      onClick={() => void copyParameter("b", "a", id)}
                                    >
                                      B→A
                                    </PickerButton>
                                    <PickerButton
                                      variant="secondary"
                                      className="!px-1.5 !py-0 text-[10px]"
                                      onClick={() => void copyParameter("a", "b", id)}
                                    >
                                      A→B
                                    </PickerButton>
                                  </>
                                ) : null}
                              </td>
                            </>
                          ) : (
                            <>
                              <td
                                className="val-opened cell-value"
                                title={openedRu ? `${opened} — ${openedRu}` : opened || undefined}
                              >
                                {formatCellLabel(opened, openedRu)}
                              </td>
                              <td className="col-current">{selectA}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>

        <EtacsSaveFileModal
          request={saveDialogRequest}
          onClose={() => setSaveDialogRequest(null)}
        />

        <EtacsUnlockModal
          open={unlockModalOpen}
          onClose={() => setUnlockModalOpen(false)}
          vin={slotA.view?.vin}
          ecuId={slotA.view?.ecuId}
          model={slotA.view?.model}
          fileKind={currentFileKind}
          licenseStatus={licenseStatus}
          storedPromoCode={storedPromoCode}
          onSavePromoCode={handleSavePromoCode}
          onRefreshStatus={() => refreshLicenseStatus()}
        />

        <EtacsObdReadModal
          open={readModalOpen}
          onClose={() => setReadModalOpen(false)}
          slotA={slotSummary("a")}
          slotB={slotSummary("b")}
          getCurrentBytesA={getCurrentBytesA}
          getCurrentBytesB={getCurrentBytesB}
          onBackupSavedA={(iso) => setSlotA((s) => ({ ...s, backupSavedAt: iso }))}
          onBackupSavedB={(iso) => setSlotB((s) => ({ ...s, backupSavedAt: iso }))}
          onCompleteToEditor={async (dump, scenario, savedNames) => {
            await completeObdReadToEditor(dump, scenario, savedNames);
          }}
        />

        <EtacsObdWriteModal
          open={writeModalOpen}
          onClose={() => setWriteModalOpen(false)}
          slotA={slotSummary("a")}
          slotB={slotSummary("b")}
          writeScenario={writeScenario}
          hasUnsavedEdits={hasUnsavedEdits}
          dirtyA={dirtyA}
          dirtyB={dirtyB}
          onSaveEditedA={() => openSaveEditedDialog("a")}
          onSaveEditedB={() => openSaveEditedDialog("b")}
          getCurrentBytesA={getCurrentBytesA}
          getCurrentBytesB={getCurrentBytesB}
          onBackupSavedA={(iso) => setSlotA((s) => ({ ...s, backupSavedAt: iso }))}
          onBackupSavedB={(iso) => setSlotB((s) => ({ ...s, backupSavedAt: iso }))}
          cufBackupBytes={cufFallbackBytes}
          cufBackupName={cufFallbackName}
          onPickCompanionCuf={(bytes, name) => {
            setCufFallbackBytes(bytes);
            setCufFallbackName(name);
          }}
        />
      </div>
    </div>
  );
}
