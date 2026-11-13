"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchAccessCheck } from "@/lib/messenger/client";
import { maskPhone } from "@/lib/messenger/phone-format";
import { formatBleFailure } from "@/lib/obd/ble-error";
import {
  ObdBleSession,
  type ObdConnectionPhase,
  type SubaruEyesightVariantRead,
  type SubaruMeter12ColumnRead,
  type SubaruMeter12ColumnWriteSessionResult,
  type SubaruMeterEyesightCompareResult,
  type SubaruEyesightVariantWriteResult,
} from "@/lib/obd/obd-session";
import {
  SUBARU_CANADIAN_OPTION_PRESETS,
  decodeSubaruAppliedModel12Columns,
  diffEyesightAgainstAppliedCatalog,
  diffMeterAgainstAppliedCatalog,
  getSsm4CgdwWriteDids,
  getSsm4YywWriteDids,
} from "@/lib/obd/subaru-ssm4-catalog";
import {
  buildSubaruEyesightBackup,
  diffBackupVsLiveEyesight,
  parseSubaruEyesightBackupJson,
  serializeSubaruEyesightBackup,
  suggestSubaruEyesightBackupFilename,
  type SubaruEyesightBackupFile,
  type SubaruEyesightWriteEntry,
} from "@/lib/obd/subaru-eyesight-backup";
import type { SubaruEyesightWriteMode } from "@/lib/obd/subaru-eyesight-variant";
import {
  buildSubaruMeterBackup,
  diffBackupVsLiveMeter,
  parseSubaruMeterBackupJson,
  serializeSubaruMeterBackup,
  suggestSubaruMeterBackupFilename,
  type SubaruMeterA0xxWriteEntry,
  type SubaruMeterBackupFile,
} from "@/lib/obd/subaru-meter-backup";
import type { SubaruMeterWriteMode } from "@/lib/obd/subaru-meter-variant";
import { formatObdEnvironmentLines, probeObdEnvironment } from "@/lib/obd/obd-environment";
import { obdTransportHint, useObdTransportKind } from "@/lib/obd/use-obd-transport";
import { SubaruImmoSection } from "./SubaruImmoSection";

type MainTab = "meter" | "immo";

const phaseLabels: Record<ObdConnectionPhase, string> = {
  idle: "Не подключено",
  adapter: "Адаптер подключён",
  vehicle: "Связь с ЭБУ",
};

export default function SubaruCodingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecking, setAuthChecking] = useState(true);
  const [loggedInPhone, setLoggedInPhone] = useState<string | null>(null);

  const [session] = useState(() => new ObdBleSession());
  const sessionRef = useRef(session);
  const [tab, setTab] = useState<MainTab>(() =>
    searchParams.get("tab") === "immo" ? "immo" : "meter",
  );
  const [phase, setPhase] = useState<ObdConnectionPhase>("idle");
  const [adapterLabel, setAdapterLabel] = useState<string | null>(null);
  const [elmVersion, setElmVersion] = useState<string | null>(null);
  const [supplyVolts, setSupplyVolts] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [envLines, setEnvLines] = useState<string[] | null>(null);

  // Meter 12-column state
  const [appliedModelInput, setAppliedModelInput] = useState("BTAEYR8");
  const [optionCodeInput, setOptionCodeInput] = useState("U45D");
  const [stickerOptionInput, setStickerOptionInput] = useState("U45L");
  const [meterWriteMode, setMeterWriteMode] = useState<"two-did" | "full-cgdw">("two-did");
  const [meter12Read, setMeter12Read] = useState<SubaruMeter12ColumnRead | null>(null);
  const [loadedBackup, setLoadedBackup] = useState<SubaruMeterBackupFile | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const [meterEyesightCompare, setMeterEyesightCompare] =
    useState<SubaruMeterEyesightCompareResult | null>(null);
  const [meter12WriteResult, setMeter12WriteResult] =
    useState<SubaruMeter12ColumnWriteSessionResult | null>(null);
  const [meter12WritePending, setMeter12WritePending] = useState<{
    appliedModel: string;
    optionCode: string;
    writeMode: SubaruMeterWriteMode;
    customA0xxWrites?: SubaruMeterA0xxWriteEntry[];
  } | null>(null);
  const [meter12SecurityKeyInput, setMeter12SecurityKeyInput] = useState("");
  const [eyesightWriteMode, setEyesightWriteMode] = useState<"full-yyw" | "region-only">("full-yyw");
  const [eyesightRead, setEyesightRead] = useState<SubaruEyesightVariantRead | null>(null);
  const [loadedEyesightBackup, setLoadedEyesightBackup] =
    useState<SubaruEyesightBackupFile | null>(null);
  const [eyesightBackupNotice, setEyesightBackupNotice] = useState<string | null>(null);
  const eyesightBackupFileInputRef = useRef<HTMLInputElement | null>(null);
  const [eyesightWriteResult, setEyesightWriteResult] =
    useState<SubaruEyesightVariantWriteResult | null>(null);
  const [eyesightWritePending, setEyesightWritePending] = useState<{
    appliedModel: string;
    optionCode: string;
    writeMode: SubaruEyesightWriteMode;
    customWrites?: SubaruEyesightWriteEntry[];
  } | null>(null);

  const meterCatalogDiff = useMemo(() => {
    if (!meter12Read) return [];
    const didHexById: Record<string, string> = {};
    for (const d of meter12Read.dids) didHexById[d.did] = d.hex;
    const model = meter12Read.match.actualAppliedModel || appliedModelInput;
    return diffMeterAgainstAppliedCatalog(model, didHexById);
  }, [meter12Read, appliedModelInput]);

  const closestCatalogRow = useMemo(() => {
    if (!meterCatalogDiff.length) return null;
    return meterCatalogDiff.reduce((best, row) =>
      row.diffs.length < best.diffs.length ? row : best,
    );
  }, [meterCatalogDiff]);

  const meterReadStats = useMemo(() => {
    if (!meter12Read) return null;
    const presentA0xx = meter12Read.dids.filter(
      (d) => /^A0[0-9A-F]{2}$/.test(d.did) && !["A000", "A020", "A040", "A060"].includes(d.did) && d.hex !== "--",
    ).length;
    const absentA0xx = meter12Read.dids.filter(
      (d) => /^A0[0-9A-F]{2}$/.test(d.did) && d.hex === "--",
    ).length;
    const bitmaps = meter12Read.dids
      .filter((d) => ["A000", "A020", "A040"].includes(d.did) && d.hex !== "--")
      .map((d) => d.did);
    return { presentA0xx, absentA0xx, bitmaps };
  }, [meter12Read]);

  const loadedBackupDiff = useMemo(() => {
    if (!loadedBackup || !meter12Read) return null;
    return diffBackupVsLiveMeter(loadedBackup, meter12Read.dids);
  }, [loadedBackup, meter12Read]);

  const modalPlannedA0xxPreview = useMemo(() => {
    if (!meter12WritePending) return [];
    if (meter12WritePending.writeMode === "custom-a0xx") {
      return (meter12WritePending.customA0xxWrites ?? []).map((w) => `${w.did}=${w.byteHex}`);
    }
    if (meter12WritePending.writeMode === "full-cgdw") {
      const list = getSsm4CgdwWriteDids(
        meter12WritePending.appliedModel,
        meter12WritePending.optionCode,
      );
      return (list ?? []).map((w) => `${w.did}=${w.byteHex}`);
    }
    const dest = meter12WritePending.optionCode.slice(0, 2);
    const a002 = dest === "C0" ? "03" : dest === "C5" ? "06" : dest === "U5" ? "05" : "02";
    const a011 = dest === "C0" || dest === "C5" ? "00" : "FF";
    return [`A002=${a002}`, `A011=${a011}`];
  }, [meter12WritePending]);

  const eyesightCatalogDiff = useMemo(() => {
    if (!eyesightRead) return [];
    const didHexById: Record<string, string> = {};
    for (const d of eyesightRead.dids) didHexById[d.did] = d.hex;
    const model =
      eyesightRead.match.appliedModel ||
      meter12Read?.match.actualAppliedModel ||
      appliedModelInput;
    return diffEyesightAgainstAppliedCatalog(model, didHexById);
  }, [eyesightRead, meter12Read, appliedModelInput]);

  const closestEyesightCatalogRow = useMemo(() => {
    if (!eyesightCatalogDiff.length) return null;
    return eyesightCatalogDiff.reduce((best, row) =>
      row.diffs.length < best.diffs.length ? row : best,
    );
  }, [eyesightCatalogDiff]);

  const eyesightReadStats = useMemo(() => {
    if (!eyesightRead) return null;
    const present35xx = eyesightRead.dids.filter(
      (d) => /^35(0[1-9A-F]|10)$/.test(d.did) && d.hex !== "--",
    ).length;
    const absent35xx = eyesightRead.dids.filter(
      (d) => /^35(0[1-9A-F]|10)$/.test(d.did) && d.hex === "--",
    ).length;
    const legacy309x = eyesightRead.dids.filter(
      (d) => /^309[1-9A-D]$/.test(d.did) && d.hex !== "--",
    ).length;
    return { present35xx, absent35xx, legacy309x };
  }, [eyesightRead]);

  const loadedEyesightBackupDiff = useMemo(() => {
    if (!loadedEyesightBackup || !eyesightRead) return null;
    return diffBackupVsLiveEyesight(loadedEyesightBackup, eyesightRead.dids);
  }, [loadedEyesightBackup, eyesightRead]);

  const modalPlannedEyesightPreview = useMemo(() => {
    if (!eyesightWritePending) return [];
    if (eyesightWritePending.writeMode === "custom-35xx") {
      return (eyesightWritePending.customWrites ?? []).map((w) => `${w.did}=${w.byteHex}`);
    }
    if (eyesightWritePending.writeMode === "region-only") {
      const list = getSsm4YywWriteDids(
        eyesightWritePending.appliedModel,
        eyesightWritePending.optionCode,
      );
      const b3502 = list?.find((w) => w.did === "3502")?.byteHex;
      if (b3502) return [`3502=${b3502}`];
      const dest = eyesightWritePending.optionCode.slice(0, 2);
      const fallback =
        dest === "C0" ? "30" : dest === "C5" ? "31" : dest === "U4" ? "20" : dest === "U5" ? "21" : null;
      return fallback ? [`3502=${fallback}`] : [];
    }
    const list = getSsm4YywWriteDids(
      eyesightWritePending.appliedModel,
      eyesightWritePending.optionCode,
    );
    return (list ?? []).map((w) => `${w.did}=${w.byteHex}`);
  }, [eyesightWritePending]);

  const { transport, ready: transportReady } = useObdTransportKind();

  useEffect(() => {
    let active = true;
    void fetchAccessCheck()
      .then((res) => {
        if (!active) return;
        if (res.messengerLoggedIn && res.phone) {
          setLoggedInPhone(res.phone);
        } else {
          setLoggedInPhone(null);
        }
        setAuthChecking(false);
      })
      .catch(() => {
        if (!active) return;
        setLoggedInPhone(null);
        setAuthChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const s = sessionRef.current;
    s.setLinkLostHandler(() => {
      setPhase("idle");
      setAdapterLabel(null);
      setElmVersion(null);
      setSupplyVolts(null);
      setBusy(false);
      setError("Связь с адаптером прервалась. Нажмите «Подключить vLinker» снова.");
    });
    return () => s.setLinkLostHandler(null);
  }, []);

  const connectOneStep = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setEnvLines(formatObdEnvironmentLines(probeObdEnvironment()));
      const { name, elm } = await sessionRef.current.connectAdapter();
      setAdapterLabel(name);
      setElmVersion(elm.versionLine);
      setPhase(sessionRef.current.phase);
      try {
        const volts = await sessionRef.current.readSupplyVoltage();
        setSupplyVolts(volts);
      } catch {
        /* ignore */
      }
      try {
        await sessionRef.current.linkVehicle();
        setPhase(sessionRef.current.phase);
      } catch {
        /* Adapter connected — UDS 783 / 7B4 works even if 0100 fails */
      }
    } catch (e) {
      setError(formatBleFailure(e));
    } finally {
      setBusy(false);
      setPhase(sessionRef.current.phase);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await sessionRef.current.disconnect();
      setAdapterLabel(null);
      setElmVersion(null);
      setSupplyVolts(null);
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }, []);

  const appliedModelAnalysis = useMemo(
    () => decodeSubaruAppliedModel12Columns(appliedModelInput, optionCodeInput),
    [appliedModelInput, optionCodeInput],
  );

  const ready = phase !== "idle";

  const handleReadMeter12Column = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sessionRef.current.readSubaruMeter12ColumnCode("6");
      setMeter12Read(result);
      if (result.match.actualAppliedModel && result.match.actualAppliedModel.length === 7) {
        setAppliedModelInput(result.match.actualAppliedModel);
      }
      if (result.match.actualOptionCode && result.match.actualOptionCode.length === 4) {
        setOptionCodeInput(result.match.actualOptionCode);
      }
      try {
        const autoBackup = buildSubaruMeterBackup(result, stickerOptionInput);
        localStorage.setItem("qhub_subaru_meter_last_backup", serializeSubaruMeterBackup(autoBackup));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чтения приборки");
    } finally {
      setBusy(false);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy]);

  const handleReadEyesightOnly = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const hintApp = meter12Read?.match.actualAppliedModel || appliedModelInput;
      const result = await sessionRef.current.readSubaruEyesightVariantCode(
        "6",
        hintApp,
        meter12SecurityKeyInput.trim() || undefined,
      );
      setEyesightRead(result);
      try {
        const autoBackup = buildSubaruEyesightBackup(result, hintApp, stickerOptionInput);
        localStorage.setItem(
          "qhub_subaru_eyesight_last_backup",
          serializeSubaruEyesightBackup(autoBackup),
        );
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка чтения EyeSight");
    } finally {
      setBusy(false);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy, meter12Read, appliedModelInput, meter12SecurityKeyInput, stickerOptionInput]);

  const handleCompareMeterEyesight = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sessionRef.current.readSubaruMeterEyesightVariantCompare(
        "6",
        meter12SecurityKeyInput.trim() || undefined,
      );
      setMeterEyesightCompare(result);
      setMeter12Read(result.meter);
      setEyesightRead(result.eyesight);
      if (result.meter.match.actualAppliedModel.length === 7) {
        setAppliedModelInput(result.meter.match.actualAppliedModel);
      }
      if (result.meter.match.actualOptionCode.length === 4) {
        setOptionCodeInput(result.meter.match.actualOptionCode);
      }
      try {
        const meterBk = buildSubaruMeterBackup(result.meter, stickerOptionInput);
        localStorage.setItem("qhub_subaru_meter_last_backup", serializeSubaruMeterBackup(meterBk));
        const esBk = buildSubaruEyesightBackup(
          result.eyesight,
          result.meter.match.actualAppliedModel,
          stickerOptionInput,
        );
        localStorage.setItem(
          "qhub_subaru_eyesight_last_backup",
          serializeSubaruEyesightBackup(esBk),
        );
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сравнения приборка / EyeSight");
    } finally {
      setBusy(false);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy, meter12SecurityKeyInput, stickerOptionInput]);

  const openMeterWriteModal = useCallback(
    (
      rawModel: string,
      rawOption: string,
      mode: SubaruMeterWriteMode = meterWriteMode,
      customA0xxWrites?: SubaruMeterA0xxWriteEntry[],
    ) => {
      if (!ready || busy) return;
      const cleanModel =
        rawModel.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) || "BTAEYR8";
      const cleanOpt =
        rawOption.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "C0QF";
      setMeter12WritePending({
        appliedModel: cleanModel,
        optionCode: cleanOpt,
        writeMode: mode,
        customA0xxWrites,
      });
    },
    [ready, busy, meterWriteMode],
  );

  const handleSaveMeterBackup = useCallback(() => {
    if (!meter12Read) return;
    const backup = buildSubaruMeterBackup(meter12Read, stickerOptionInput);
    const json = serializeSubaruMeterBackup(backup);
    const filename = suggestSubaruMeterBackupFilename(backup);
    try {
      localStorage.setItem("qhub_subaru_meter_last_backup", json);
    } catch {
      /* ignore quota errors */
    }
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setLoadedBackup(backup);
    setBackupNotice(
      `Оригинал сохранён: ${filename} (${backup.restoreA0xxDids.length} активных A0xx DID и таблица отличий от cgdw).`,
    );
  }, [meter12Read, stickerOptionInput]);

  const handleLoadMeterBackupFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const text = await file.text();
        const res = parseSubaruMeterBackupJson(text);
        if (!res.ok) {
          setError(res.errorRu);
          return;
        }
        setLoadedBackup(res.backup);
        setBackupNotice(
          `Загружен бэкап ${file.name}: ${res.backup.appliedModel}+${res.backup.stickerOptionCode ?? res.backup.inferredOptionCode} (${res.backup.restoreA0xxDids.length} A0xx DID).`,
        );
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось прочитать файл бэкапа");
      }
    },
    [],
  );

  const handleLoadLastAutoBackup = useCallback(() => {
    try {
      const raw = localStorage.getItem("qhub_subaru_meter_last_backup");
      if (!raw) {
        setError("В памяти браузера пока нет сохранённого бэкапа приборки.");
        return;
      }
      const res = parseSubaruMeterBackupJson(raw);
      if (!res.ok) {
        setError(res.errorRu);
        return;
      }
      setLoadedBackup(res.backup);
      setBackupNotice(
        `Загружен последний бэкап из браузера (${res.backup.appliedModel}+${res.backup.stickerOptionCode ?? res.backup.inferredOptionCode}, ${res.backup.restoreA0xxDids.length} DID).`,
      );
      setError(null);
    } catch {
      setError("Не удалось загрузить авто-бэкап из localStorage.");
    }
  }, []);

  const openEyesightWriteModal = useCallback(
    (
      rawModel: string,
      rawOption: string,
      mode: SubaruEyesightWriteMode = eyesightWriteMode,
      customWrites?: SubaruEyesightWriteEntry[],
    ) => {
      if (!ready || busy) return;
      const cleanModel =
        rawModel.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) || "BTAEYR8";
      const cleanOpt =
        rawOption.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "C0QF";
      setEyesightWritePending({
        appliedModel: cleanModel,
        optionCode: cleanOpt,
        writeMode: mode,
        customWrites,
      });
    },
    [ready, busy, eyesightWriteMode],
  );

  const handleSaveEyesightBackup = useCallback(() => {
    if (!eyesightRead) return;
    const hintApp = meter12Read?.match.actualAppliedModel || appliedModelInput;
    const backup = buildSubaruEyesightBackup(eyesightRead, hintApp, stickerOptionInput);
    const json = serializeSubaruEyesightBackup(backup);
    const filename = suggestSubaruEyesightBackupFilename(backup);
    try {
      localStorage.setItem("qhub_subaru_eyesight_last_backup", json);
    } catch {
      /* ignore */
    }
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setLoadedEyesightBackup(backup);
    setEyesightBackupNotice(
      `Оригинал EyeSight сохранён: ${filename} (${backup.restore35xxDids.length} DID и отличия от Y-Yw).`,
    );
  }, [eyesightRead, meter12Read, appliedModelInput, stickerOptionInput]);

  const handleLoadEyesightBackupFile = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const res = parseSubaruEyesightBackupJson(text);
      if (!res.ok) {
        setError(res.errorRu);
        return;
      }
      setLoadedEyesightBackup(res.backup);
      setEyesightBackupNotice(
        `Загружен бэкап EyeSight ${file.name}: ${res.backup.appliedModel}+${res.backup.stickerOptionCode ?? res.backup.inferredOptionCode} (${res.backup.restore35xxDids.length} DID).`,
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось прочитать файл бэкапа EyeSight");
    }
  }, []);

  const handleLoadLastEyesightAutoBackup = useCallback(() => {
    try {
      const raw = localStorage.getItem("qhub_subaru_eyesight_last_backup");
      if (!raw) {
        setError("В памяти браузера пока нет сохранённого бэкапа EyeSight.");
        return;
      }
      const res = parseSubaruEyesightBackupJson(raw);
      if (!res.ok) {
        setError(res.errorRu);
        return;
      }
      setLoadedEyesightBackup(res.backup);
      setEyesightBackupNotice(
        `Загружен последний бэкап EyeSight из браузера (${res.backup.appliedModel}+${res.backup.stickerOptionCode ?? res.backup.inferredOptionCode}, ${res.backup.restore35xxDids.length} DID).`,
      );
      setError(null);
    } catch {
      setError("Не удалось загрузить авто-бэкап EyeSight из localStorage.");
    }
  }, []);

  const executeEyesightVariantWrite = useCallback(async () => {
    if (!ready || busy || !eyesightWritePending) return;
    const pending = eyesightWritePending;
    setEyesightWritePending(null);
    setBusy(true);
    setError(null);
    try {
      const result = await sessionRef.current.writeSubaruEyesightVariantCode(
        pending.appliedModel,
        pending.optionCode,
        "6",
        meter12SecurityKeyInput.trim() || undefined,
        {
          writeMode: pending.writeMode,
          customWrites: pending.customWrites,
          txHex: eyesightRead?.txHex,
          rxHex: eyesightRead?.rxHex,
        },
      );
      setEyesightWriteResult(result);
      if (!result.success) {
        setError(
          result.securityAccessRequired
            ? "EyeSight: нужен SecurityAccess (27 03/04) — укажите ключ или используйте SSM4 с авторизацией."
            : result.steps.at(-1) ?? "Запись EyeSight не подтверждена.",
        );
      } else {
        const cmp = await sessionRef.current.readSubaruMeterEyesightVariantCompare(
          "6",
          meter12SecurityKeyInput.trim() || undefined,
        );
        setMeterEyesightCompare(cmp);
        setMeter12Read(cmp.meter);
        setEyesightRead(cmp.eyesight);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка записи EyeSight");
    } finally {
      setBusy(false);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy, eyesightWritePending, meter12SecurityKeyInput, eyesightRead]);

  const executeMeter12Write = useCallback(async () => {
    if (!ready || busy || !meter12WritePending) return;
    const pending = meter12WritePending;
    if (pending.appliedModel.trim().length !== 7 || pending.optionCode.trim().length !== 4) return;
    setMeter12WritePending(null);
    setBusy(true);
    setError(null);
    try {
      const result = await sessionRef.current.writeSubaruMeter12ColumnCode(
        pending.appliedModel,
        pending.optionCode,
        "6",
        meter12SecurityKeyInput.trim() || undefined,
        {
          writeMode: pending.writeMode,
          customA0xxWrites: pending.customA0xxWrites,
        },
      );
      setMeter12WriteResult(result);
      if (result.after) setMeter12Read(result.after);
      else if (result.before) setMeter12Read(result.before);
      if (!result.success) {
        setError(result.steps.at(-1) ?? "Запись не подтверждена приборкой.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка записи приборки");
    } finally {
      setBusy(false);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy, meter12WritePending, meter12SecurityKeyInput]);

  if (authChecking) {
    return (
      <div className="min-h-[60dvh] flex items-center justify-center text-sm text-gray-500">
        Проверка авторизации по номеру телефона…
      </div>
    );
  }

  if (!loggedInPhone) {
    return (
      <div className="min-h-[70dvh] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-6 space-y-4 text-center shadow-sm">
          <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            Защищённый сервис QHub
          </div>
          <h1 className="text-lg font-bold text-gray-900">
            Subaru Coding & Immobilizer
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Перевод показаний Subaru с °F на °C и иммобилайзер (чтение ключей, прописка ключей и регистрация автозапуска RES) доступны после входа по номеру телефона.
          </p>
          <button
            type="button"
            onClick={() => router.push("/tools/messenger/login?next=/tools/subaru-coding")}
            className="w-full rounded-xl bg-gray-900 hover:bg-gray-800 text-white px-4 py-3 text-sm font-semibold transition"
          >
            Войти по номеру телефона
          </button>
          <div className="pt-1 flex justify-center gap-3 text-xs text-gray-500">
            <Link href="/tools/obd-diag" className="underline hover:text-gray-800">
              ← В Subaru Diagnostics
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-500">
            <span>QHub · Subaru Service</span>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
              {maskPhone(loggedInPhone)}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Subaru Coding & Immobilizer
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {supplyVolts != null && (
            <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-mono text-xs text-emerald-700">
              {supplyVolts.toFixed(1)} В
            </span>
          )}
          <Link
            href="/tools/obd-diag"
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            Subaru Diagnostics
          </Link>
        </div>
      </header>

      {/* Connection Bar */}
      {ready ? (
        <section className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span>{adapterLabel ?? "vLinker"} · Подключён ({phaseLabels[phase]})</span>
            </div>
            {elmVersion && <div className="truncate text-[11px] text-gray-500">{elmVersion}</div>}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnect()}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 disabled:opacity-40"
          >
            Отключить
          </button>
        </section>
      ) : (
        <section className="rounded-xl border border-gray-200 bg-white p-3.5 text-sm space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              Транспорт: <strong className="text-gray-800">{transportReady ? transport : "…"}</strong>
            </span>
            <span className="font-medium text-gray-600">{phaseLabels[phase]}</span>
          </div>
          <button
            type="button"
            disabled={busy || !transportReady}
            onClick={() => void connectOneStep()}
            className="w-full rounded-xl bg-gray-900 hover:bg-gray-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Подключить vLinker и автомобиль
          </button>
          {transportReady && transport === "none" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 space-y-1">
              <p>{obdTransportHint("none")}</p>
              <button
                type="button"
                className="underline"
                onClick={() => setEnvLines(formatObdEnvironmentLines(probeObdEnvironment()))}
              >
                Показать диагностику Bluetooth
              </button>
              {envLines && <pre className="whitespace-pre-wrap text-[11px]">{envLines.join("\n")}</pre>}
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {/* 2 Clean Main Tabs: 1) Приборка (°F → °C)  2) Иммобилайзер Subaru */}
      <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setTab("meter")}
          className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-bold transition sm:text-sm ${
            tab === "meter" ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          °F → °C
        </button>
        <button
          type="button"
          onClick={() => setTab("immo")}
          className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-bold transition sm:text-sm ${
            tab === "immo" ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Иммобилайзер Subaru (Ключи / RES)
        </button>
      </div>

      {tab === "meter" ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Перевод с °F на °C
              </h2>
              <p className="text-xs text-gray-500">
                SSM4 спрашивает Applied Model как ключ к cgdw (приборка A0xx) и Y-Yw (EyeSight 35xx) — в ЭБУ уходит маска, не ASCII 7+4.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => void handleReadMeter12Column()}
                className="rounded-xl bg-blue-800 hover:bg-blue-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                1. Считать приборку
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => void handleReadEyesightOnly()}
                className="rounded-xl bg-violet-700 hover:bg-violet-800 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Считать EyeSight (ADA-032)
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => void handleCompareMeterEyesight()}
                className="rounded-xl bg-indigo-800 hover:bg-indigo-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Сравнить 783 ↔ 787
              </button>
            </div>
          </div>

          {meter12Read && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <div className="text-[10px] font-bold uppercase text-amber-900">
                  Приборка (cgdw → A0xx)
                </div>
                <div className="mt-1 font-mono text-base font-bold text-gray-900">
                  {meter12Read.match.actualAppliedModel} + {meter12Read.match.actualOptionCode}
                </div>
                <div className="text-[11px] text-amber-900">{meter12Read.match.actualRegion}</div>
              </div>
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                <div className="text-[10px] font-bold uppercase text-emerald-900">
                  Рекомендуемый канадский код (°C, км/ч)
                </div>
                <div className="mt-1 font-mono text-base font-bold text-emerald-900">
                  {meter12Read.match.actualAppliedModel} + {meter12Read.match.recommendedCanadianOptionC0}
                </div>
                <div className="text-[11px] text-emerald-800">
                  Альтернатива PZEV: {meter12Read.match.recommendedCanadianOptionC5}
                </div>
              </div>
            </div>
          )}

          {meter12Read && meterCatalogDiff.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-gray-900">
                  Полное чтение SSM4 (mHZ + cgdw) против справочника для{" "}
                  {meter12Read.match.actualAppliedModel}
                </div>
                {meterReadStats && (
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-700">
                    Активных A0xx: {meterReadStats.presentA0xx} · Отсутствуют (--):{" "}
                    {meterReadStats.absentA0xx} · Карты:{" "}
                    {meterReadStats.bitmaps.join(", ") || "—"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-600">
                Считано ровно по таблице SSM4 <code className="font-mono">cGZGBPHB-WmTWLZ.mHZ</code>{" "}
                (46 DID + A00E).{" "}
                {closestCatalogRow && (
                  <>
                    Ближайшая строка справочника:{" "}
                    <strong className="font-mono">{closestCatalogRow.optionCode}</strong>{" "}
                    (отличий: {closestCatalogRow.diffs.length}).{" "}
                  </>
                )}
                Если кода со стойки (например U45L) нет в таблице — сохраните дамп ниже, чтобы зафиксировать разницы и иметь 1:1 откат.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="text-gray-600">
                    <tr>
                      <th className="px-2 py-1">Option</th>
                      <th className="px-2 py-1">Отличия от оригинала приборки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meterCatalogDiff.map((row) => {
                      const isClosest =
                        closestCatalogRow && closestCatalogRow.optionCode === row.optionCode;
                      return (
                        <tr
                          key={row.optionCode}
                          className={`border-t border-gray-100 align-top ${
                            isClosest ? "bg-amber-50/70" : ""
                          }`}
                        >
                          <td className="px-2 py-1 font-mono font-bold whitespace-nowrap">
                            {row.optionCode}
                            {isClosest && (
                              <span className="ml-1 rounded bg-amber-200 px-1 py-0.5 text-[9px] text-amber-950">
                                ближе всего
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 font-mono">
                            {row.diffs.length === 0
                              ? row.identical
                                ? "совпадает целиком"
                                : "прочитанные байты совпали"
                              : row.diffs
                                  .map((d) => `${d.did}: авто ${d.car} / cgdw ${d.catalog}`)
                                  .join("; ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Original Backup Save-As & Restore Panel */}
          <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-900">
                  Бэкап оригинала приборки (сохранить как / восстановить 1:1)
                </div>
                <p className="text-[11px] text-slate-600">
                  Сохраняет полный дамп всех считанных A0xx DID и разницу со справочником cgdw в JSON-файл — можно откатить оригинал (в т.ч. U45L) без последствий.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="text-[10px] font-semibold text-slate-700">
                  Код со стойки B для метки в файле (опц.):
                </span>
                <input
                  type="text"
                  maxLength={4}
                  value={stickerOptionInput}
                  onChange={(e) =>
                    setStickerOptionInput(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4),
                    )
                  }
                  placeholder="U45L"
                  className="mt-0.5 block w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold uppercase text-slate-900"
                />
              </label>
              <button
                type="button"
                disabled={!meter12Read}
                onClick={handleSaveMeterBackup}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                Сохранить оригинал как… (.json)
              </button>
              <button
                type="button"
                onClick={() => backupFileInputRef.current?.click()}
                className="rounded-xl border border-slate-400 bg-white hover:bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-900"
              >
                Загрузить бэкап из файла…
              </button>
              <button
                type="button"
                onClick={handleLoadLastAutoBackup}
                className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700"
              >
                Из памяти браузера
              </button>
              <input
                ref={backupFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void handleLoadMeterBackupFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {backupNotice && (
              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700">
                {backupNotice}
              </div>
            )}

            {loadedBackup && (
              <div className="rounded-lg border border-indigo-200 bg-white p-2.5 space-y-2 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-indigo-950">
                      Бэкап: {loadedBackup.appliedModel} +{" "}
                      {loadedBackup.stickerOptionCode ?? loadedBackup.inferredOptionCode}
                    </span>{" "}
                    <span className="text-gray-500">
                      ({loadedBackup.vin ?? "без VIN"} · {loadedBackup.savedAt.slice(0, 19).replace("T", " ")})
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!ready || busy}
                    onClick={() =>
                      openMeterWriteModal(
                        loadedBackup.appliedModel,
                        loadedBackup.stickerOptionCode ?? loadedBackup.inferredOptionCode,
                        "custom-a0xx",
                        loadedBackup.restoreA0xxDids,
                      )
                    }
                    className="rounded-lg bg-indigo-700 hover:bg-indigo-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Восстановить оригинал ({loadedBackup.restoreA0xxDids.length} DID)
                  </button>
                </div>
                {loadedBackupDiff && (
                  <div className="font-mono text-[10px] text-gray-700">
                    {loadedBackupDiff.changed.length === 0
                      ? `Текущая приборка полностью совпадает с бэкапом (${loadedBackupDiff.unchangedCount} DID).`
                      : `Отличается от текущей приборки (${loadedBackupDiff.changed.length} DID): ${loadedBackupDiff.changed
                          .map((c) => `${c.did}: сейчас ${c.liveHex} → в бэкапе ${c.backupHex}`)
                          .join("; ")}`}
                  </div>
                )}
              </div>
            )}
          </div>

          {meterEyesightCompare && (
            <div
              className={`rounded-xl border p-3 space-y-2 ${
                meterEyesightCompare.compare.optionCodesMatch === true
                  ? "border-emerald-300 bg-emerald-50"
                  : meterEyesightCompare.compare.optionCodesMatch === false ||
                      meterEyesightCompare.compare.regionsAligned === false
                    ? "border-rose-300 bg-rose-50"
                    : "border-amber-300 bg-amber-50"
              }`}
            >
              <div className="text-xs font-bold text-gray-900">
                {meterEyesightCompare.compare.verdictRu}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  Приборка 783:{" "}
                  <code className="font-mono font-bold">
                    {meterEyesightCompare.compare.meterApplied}+
                    {meterEyesightCompare.compare.meterOption}
                  </code>
                </div>
                <div>
                  EyeSight 787:{" "}
                  <code className="font-mono font-bold">
                    {(meterEyesightCompare.compare.eyesightApplied ?? "—")}+
                    {(meterEyesightCompare.compare.eyesightOption ?? "—")}
                  </code>
                  {" "}
                  (3502→{meterEyesightCompare.compare.eyesightRegion})
                </div>
              </div>
              <div className="text-[11px] text-gray-700">{meterEyesightCompare.compare.detailRu}</div>
              {meterEyesightCompare.compare.regionsAligned === false && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!ready || busy}
                    onClick={() => {
                      const targetOpt =
                        meterEyesightCompare.compare.meterOption.startsWith("C")
                          ? meterEyesightCompare.compare.meterOption
                          : meter12Read?.match.recommendedCanadianOptionC0 || "C0QF";
                      openEyesightWriteModal(
                        meterEyesightCompare.compare.meterApplied || appliedModelInput,
                        targetOpt,
                      );
                    }}
                    className="rounded-lg bg-violet-800 hover:bg-violet-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Синхронизировать EyeSight → {meterEyesightCompare.compare.meterApplied}+
                    {meterEyesightCompare.compare.meterOption.startsWith("C")
                      ? meterEyesightCompare.compare.meterOption
                      : meter12Read?.match.recommendedCanadianOptionC0 || "C0QF"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* EyeSight ADA-032 Full Read vs Y-Yw Catalog + Backup & ADA-031 Sync */}
          {eyesightRead && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-violet-950">
                  EyeSight {eyesightRead.txHex}→{eyesightRead.rxHex} (ADA-032 Confirm on Parameter · Y-Yw)
                </div>
                {eyesightReadStats && (
                  <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[10px] text-violet-900 border border-violet-200">
                    3501..3510: {eyesightReadStats.present35xx}/16 · Пропуски (--):{" "}
                    {eyesightReadStats.absent35xx}
                    {eyesightReadStats.legacy309x > 0
                      ? ` · Legacy 309x: ${eyesightReadStats.legacy309x}/13`
                      : ""}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-violet-200 bg-white p-2.5">
                  <div className="text-[10px] font-bold uppercase text-violet-800">
                    Распознано из Y-Yw
                  </div>
                  <div className="mt-0.5 font-mono font-bold text-gray-900">
                    {(eyesightRead.match.appliedModel ?? "—")} +{" "}
                    {(eyesightRead.match.optionCode ?? "—")}
                  </div>
                  <div className="text-[11px] text-violet-900">
                    DID 3502 → {eyesightRead.match.destinationHint} (байт{" "}
                    {eyesightRead.match.byte3502 ?? "—"})
                  </div>
                </div>
                <div className="rounded-lg border border-violet-200 bg-white p-2.5 font-mono text-[10px] text-gray-800 break-all">
                  <div className="font-sans text-[10px] font-bold uppercase text-violet-800 mb-0.5">
                    Считанные 16 DID (3501..3510)
                  </div>
                  {eyesightRead.dids
                    .filter((d) => /^35(0[1-9A-F]|10)$/.test(d.did))
                    .map((d) => `${d.did}=${d.hex}`)
                    .join(" ")}
                </div>
              </div>

              {eyesightCatalogDiff.length > 0 && (
                <div className="rounded-lg border border-violet-200 bg-white p-2.5 space-y-1.5">
                  <div className="text-[11px] font-bold text-gray-900">
                    Сравнение EyeSight с таблицей Y-YwPHBWHoZ.mLW для{" "}
                    {eyesightRead.match.appliedModel ||
                      meter12Read?.match.actualAppliedModel ||
                      appliedModelInput}
                    {closestEyesightCatalogRow && (
                      <span className="ml-1.5 font-normal text-gray-600">
                        (ближе всего: <strong className="font-mono">{closestEyesightCatalogRow.optionCode}</strong>, отличий: {closestEyesightCatalogRow.diffs.length})
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="text-gray-600">
                        <tr>
                          <th className="px-2 py-1">Option</th>
                          <th className="px-2 py-1">Отличия от EyeSight (3501..3510)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eyesightCatalogDiff.map((row) => {
                          const isClosest =
                            closestEyesightCatalogRow &&
                            closestEyesightCatalogRow.optionCode === row.optionCode;
                          return (
                            <tr
                              key={row.optionCode}
                              className={`border-t border-gray-100 align-top ${
                                isClosest ? "bg-violet-50/70" : ""
                              }`}
                            >
                              <td className="px-2 py-1 font-mono font-bold whitespace-nowrap">
                                {row.optionCode}
                                {isClosest && (
                                  <span className="ml-1 rounded bg-violet-200 px-1 py-0.5 text-[9px] text-violet-950">
                                    ближе всего
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 font-mono">
                                {row.diffs.length === 0
                                  ? row.identical
                                    ? "совпадает целиком (16/16)"
                                    : "прочитанные байты совпали"
                                  : row.diffs
                                      .map((d) => `${d.did}: авто ${d.car} / Y-Yw ${d.catalog}`)
                                      .join("; ")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {eyesightRead.steps && eyesightRead.steps.length > 0 && (
                <details className="text-[10px] text-gray-700">
                  <summary className="cursor-pointer font-semibold text-violet-900">
                    Журнал чтения EyeSight ({eyesightRead.steps.length})
                  </summary>
                  <ul className="mt-1 space-y-0.5 font-mono pl-3">
                    {eyesightRead.steps.map((s, idx) => (
                      <li key={idx}>• {s}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* EyeSight Backup Save-As & Restore + ADA-031 Sync */}
          <div className="rounded-xl border border-violet-300 bg-violet-50/50 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-violet-950">
                  3. EyeSight (787) — синхронизация региона, загрузка ADA-031 и бэкап
                </div>
                <p className="text-[11px] text-violet-900">
                  {eyesightWriteMode === "full-yyw"
                    ? "Полный режим SSM4 ADA-031 Selection of Parameter: пишет все 16 DID (3501..350A + ReadWriteDidListData 350B..3510) из Y-Yw и побайтово проверяет результат."
                    : "Безопасный минимум (только регион): меняет только DID 3502 (20/21=США, 30/31=Канада), сохраняя заводские 3501 и 3503..3510."}
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-violet-300 bg-white p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setEyesightWriteMode("full-yyw")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    eyesightWriteMode === "full-yyw"
                      ? "bg-violet-800 text-white"
                      : "text-gray-700 hover:bg-violet-50"
                  }`}
                >
                  Все 16 DID как SSM4 (ADA-031)
                </button>
                <button
                  type="button"
                  onClick={() => setEyesightWriteMode("region-only")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    eyesightWriteMode === "region-only"
                      ? "bg-violet-800 text-white"
                      : "text-gray-700 hover:bg-violet-50"
                  }`}
                >
                  Только регион (3502)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() =>
                  openEyesightWriteModal(
                    appliedModelAnalysis.appliedModel || "BTAEYR8",
                    appliedModelAnalysis.canadianOptionCodeC0 || "C0QF",
                  )
                }
                className="rounded-xl bg-violet-800 hover:bg-violet-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Записать Канада {appliedModelAnalysis.canadianOptionCodeC0} в EyeSight
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => {
                  const fromCgdw = appliedModelAnalysis.cgdwOptionCodes.find((c) => c.startsWith("U"));
                  openEyesightWriteModal(
                    appliedModelAnalysis.appliedModel || "BTAEYR8",
                    fromCgdw ?? "U45D",
                  );
                }}
                className="rounded-xl border border-violet-400 bg-white hover:bg-violet-50 px-3 py-2 text-xs font-bold text-violet-950 disabled:opacity-40"
              >
                Вернуть США ({appliedModelAnalysis.cgdwOptionCodes.find((c) => c.startsWith("U")) ?? "U45D"}) в EyeSight
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => openEyesightWriteModal(appliedModelInput, optionCodeInput)}
                className="rounded-xl bg-gray-900 hover:bg-gray-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Загрузить из полей ({appliedModelInput || "BTAEYR8"}+{optionCodeInput || "U45D"})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-violet-200">
              <button
                type="button"
                disabled={!eyesightRead}
                onClick={handleSaveEyesightBackup}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Сохранить оригинал EyeSight как… (.json)
              </button>
              <button
                type="button"
                onClick={() => eyesightBackupFileInputRef.current?.click()}
                className="rounded-xl border border-slate-400 bg-white hover:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-900"
              >
                Загрузить бэкап EyeSight…
              </button>
              <button
                type="button"
                onClick={handleLoadLastEyesightAutoBackup}
                className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Из памяти браузера
              </button>
              <input
                ref={eyesightBackupFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void handleLoadEyesightBackupFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {eyesightBackupNotice && (
              <div className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700">
                {eyesightBackupNotice}
              </div>
            )}

            {loadedEyesightBackup && (
              <div className="rounded-lg border border-violet-300 bg-white p-2.5 space-y-1.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-violet-950">
                      Бэкап EyeSight: {loadedEyesightBackup.appliedModel} +{" "}
                      {loadedEyesightBackup.stickerOptionCode ??
                        loadedEyesightBackup.inferredOptionCode}
                    </span>{" "}
                    <span className="text-gray-500">
                      ({loadedEyesightBackup.vin ?? "без VIN"} ·{" "}
                      {loadedEyesightBackup.savedAt.slice(0, 19).replace("T", " ")})
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!ready || busy}
                    onClick={() =>
                      openEyesightWriteModal(
                        loadedEyesightBackup.appliedModel,
                        loadedEyesightBackup.stickerOptionCode ??
                          loadedEyesightBackup.inferredOptionCode,
                        "custom-35xx",
                        loadedEyesightBackup.restore35xxDids,
                      )
                    }
                    className="rounded-lg bg-violet-700 hover:bg-violet-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Восстановить оригинал EyeSight ({loadedEyesightBackup.restore35xxDids.length} DID)
                  </button>
                </div>
                {loadedEyesightBackupDiff && (
                  <div className="font-mono text-[10px] text-gray-700">
                    {loadedEyesightBackupDiff.changed.length === 0
                      ? `Текущий EyeSight полностью совпадает с бэкапом (${loadedEyesightBackupDiff.unchangedCount} DID).`
                      : `Отличается от текущего EyeSight (${loadedEyesightBackupDiff.changed.length} DID): ${loadedEyesightBackupDiff.changed
                          .map((c) => `${c.did}: сейчас ${c.liveHex} → в бэкапе ${c.backupHex}`)
                          .join("; ")}`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-800">
                Applied Model (7 знаков со стойки B):
              </span>
              <input
                type="text"
                maxLength={7}
                value={appliedModelInput}
                onChange={(e) =>
                  setAppliedModelInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))
                }
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm font-bold uppercase text-gray-900"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-800">
                Option Code (4 знака — U45D / C0QF / C0RF):
              </span>
              <input
                type="text"
                maxLength={4}
                value={optionCodeInput}
                onChange={(e) =>
                  setOptionCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))
                }
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm font-bold uppercase text-gray-900"
              />
            </label>
          </div>

          {appliedModelAnalysis.valid && (
            <div
              className={`rounded-xl border px-3 py-2 text-[11px] ${
                appliedModelAnalysis.validInSsm4Cgdw
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              {appliedModelAnalysis.validInSsm4Cgdw
                ? `Пара в каталоге SSM4 cgdw: OK. Допустимые Option: ${appliedModelAnalysis.cgdwOptionCodes.join(", ") || "—"}.`
                : `Пары ${appliedModelAnalysis.appliedModel}+${appliedModelAnalysis.optionCode} нет в cgdw SSM4 — запись может быть отклонена. Для °C используйте ${appliedModelAnalysis.canadianOptionCodeC0}. Dual X-Mode = 6-й знак Applied (${appliedModelAnalysis.gradeChar}), не Option Code.`}
            </div>
          )}

          {/* Always-active Write Buttons when connected */}
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-emerald-950">
                2. Перевести на °C (выберите объём записи DID):
              </div>
              <div className="inline-flex rounded-lg border border-emerald-300 bg-white p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setMeterWriteMode("two-did")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    meterWriteMode === "two-did"
                      ? "bg-emerald-700 text-white"
                      : "text-gray-700 hover:bg-emerald-50"
                  }`}
                >
                  Только 2 DID (A002+A011)
                </button>
                <button
                  type="button"
                  onClick={() => setMeterWriteMode("full-cgdw")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    meterWriteMode === "full-cgdw"
                      ? "bg-emerald-700 text-white"
                      : "text-gray-700 hover:bg-emerald-50"
                  }`}
                >
                  Все DID как SSM4 (cgdw)
                </button>
              </div>
            </div>
            <p className="text-[11px] text-emerald-900">
              {meterWriteMode === "two-did"
                ? "Безопасный минимум: пишет только A002 (рынок) и A011 (°C/°F), оставляя заводские A024/A036 и остальные ~26 байт нетронутыми (безопасно даже если заводского кода как U45L нет в справочнике)."
                : "Полный режим SSM4 sendMetVariByApplied: перезаписывает все ~28 A0xx DID выбранной строки справочника cgdw (в т.ч. A024/A036). Перед записью сохраните бэкап оригинала! Для кодов вне cgdw (U45L) используйте «Только 2 DID» или бэкап."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() =>
                  openMeterWriteModal(
                    appliedModelAnalysis.appliedModel || "BTAEYR8",
                    appliedModelAnalysis.canadianOptionCodeC0 || "C0QF",
                  )
                }
                className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Записать Канада {appliedModelAnalysis.canadianOptionCodeC0} (°C, км/ч)
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => {
                  const fromCgdw = appliedModelAnalysis.cgdwOptionCodes.find((c) => c.startsWith("U"));
                  if (fromCgdw) {
                    openMeterWriteModal(appliedModelAnalysis.appliedModel || "BTAEYR8", fromCgdw);
                    return;
                  }
                  const rawSuffix =
                    optionCodeInput.trim().length === 4 ? optionCodeInput.trim().toUpperCase().slice(2, 4) : "5D";
                  const usSuffix =
                    rawSuffix === "QF" || rawSuffix === "RF" || rawSuffix === "IY" ? "5D" : rawSuffix;
                  openMeterWriteModal(appliedModelAnalysis.appliedModel || "BTAEYR8", `U4${usSuffix}`);
                }}
                className="rounded-xl border border-gray-400 bg-white hover:bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-900 disabled:opacity-40"
              >
                Вернуть США (
                {appliedModelAnalysis.cgdwOptionCodes.find((c) => c.startsWith("U")) ?? "U45D"} · °F, мили)
              </button>
              <button
                type="button"
                disabled={!ready || busy}
                onClick={() => openMeterWriteModal(appliedModelInput, optionCodeInput)}
                className="rounded-xl bg-gray-900 hover:bg-gray-800 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Записать из полей ({appliedModelInput || "BTAEYR8"}+{optionCodeInput || "U45D"})
              </button>
            </div>
            <div className="pt-1">
              <input
                type="text"
                value={meter12SecurityKeyInput}
                onChange={(e) => setMeter12SecurityKeyInput(e.target.value.toUpperCase())}
                placeholder="Опционально: свой Key для 27 04 (оставьте пустым для авто-расчёта)"
                className="w-full rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 font-mono text-xs uppercase text-gray-900"
              />
            </div>
          </div>

          {eyesightWriteResult && (
            <div
              className={`rounded-xl border p-3 text-xs space-y-1.5 font-mono ${
                eyesightWriteResult.success
                  ? "border-violet-300 bg-violet-50 text-violet-950"
                  : "border-rose-300 bg-rose-50 text-rose-950"
              }`}
            >
              <div className="font-bold font-sans">
                {eyesightWriteResult.success
                  ? `✓ EyeSight ADA-031 (${eyesightWriteResult.writeMode}): подтверждено ${eyesightWriteResult.verifiedCount}/${eyesightWriteResult.targetCount} DID (${eyesightWriteResult.appliedModel}+${eyesightWriteResult.optionCode})`
                  : `Запись EyeSight не подтверждена (записано ${eyesightWriteResult.writtenCount}/${eyesightWriteResult.targetCount}, сверено ${eyesightWriteResult.verifiedCount}/${eyesightWriteResult.targetCount})`}
              </div>
              {eyesightWriteResult.cgwFilterRemoved && (
                <div className="font-sans text-[11px]">CGW FilterRemove: да</div>
              )}
              {eyesightWriteResult.mismatchedDids.length > 0 && (
                <div className="font-sans text-[11px] text-rose-800">
                  Расхождения при повторном чтении: {eyesightWriteResult.mismatchedDids.join("; ")}
                </div>
              )}
              <ul className="max-h-40 overflow-y-auto list-disc pl-4 space-y-0.5 text-[10px]">
                {eyesightWriteResult.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {meter12WriteResult && (
            <div
              className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                meter12WriteResult.success
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-rose-300 bg-rose-50"
              }`}
            >
              <div className="font-bold">
                {meter12WriteResult.success
                  ? `✓ Записано DID ${meter12WriteResult.writtenDid}: ${meter12WriteResult.plan.appliedModel} + ${meter12WriteResult.plan.optionCode}`
                  : "Запись остановлена"}
              </div>
              {meter12WriteResult.after && (
                <div>
                  После записи считано:{" "}
                  <code className="font-mono font-bold">
                    {meter12WriteResult.after.match.inferredAppliedModel} +{" "}
                    {meter12WriteResult.after.match.inferredOptionCode}
                  </code>{" "}
                  ({meter12WriteResult.after.match.inferredRegion})
                </div>
              )}
              <ul className="max-h-40 overflow-y-auto space-y-0.5 font-mono text-[10px] text-gray-700">
                {meter12WriteResult.steps.map((step, idx) => (
                  <li key={idx}>• {step}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Presets Table */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-gray-700">
              Справочник замен из SSM4 cgdw (нажмите — подставить Applied + канадский Option):
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="px-2.5 py-1.5">Модель</th>
                    <th className="px-2.5 py-1.5">Комплектация</th>
                    <th className="px-2.5 py-1.5">Applied Model</th>
                    <th className="px-2.5 py-1.5">США</th>
                    <th className="px-2.5 py-1.5">Канада (°C)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {SUBARU_CANADIAN_OPTION_PRESETS.map((preset) => (
                    <tr
                      key={preset.id}
                      onClick={() => {
                        setAppliedModelInput(preset.appliedModel);
                        setOptionCodeInput(preset.canadianOptionCodeC0);
                      }}
                      className="cursor-pointer hover:bg-emerald-50"
                    >
                      <td className="px-2.5 py-1.5 font-semibold text-gray-800">
                        {preset.modelSeriesRu} <span className="text-gray-500">({preset.years})</span>
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-700">{preset.trimRu}</td>
                      <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-700">
                        {preset.appliedModel}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-gray-500">
                        {preset.usOptionCodeExamples.join(", ")}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-700">
                        {preset.canadianOptionCodeC0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <SubaruImmoSection
          session={session}
          ready={ready}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
        />
      )}

      {/* Clean Confirm Modal without 0205 */}
      {eyesightWritePending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setEyesightWritePending(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-violet-900 bg-white p-5 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-lg bg-violet-900 px-3 py-1.5 text-xs font-bold text-white">
              {eyesightWritePending.writeMode === "custom-35xx"
                ? "Восстановление оригинала EyeSight из бэкапа"
                : eyesightWritePending.writeMode === "region-only"
                  ? "EyeSight — запись только региона (DID 3502)"
                  : "EyeSight — Selection of Parameter (SSM4 ADA-031 · 16 DID)"}
            </div>
            <p className="text-[11px] text-gray-700 leading-relaxed">
              Запись Vehicle Model Registration в блок EyeSight ({eyesightRead?.txHex ?? "787"}).
              Перед записью снимается CGW FilterRemove, затем выполняется 10 03 → SecurityAccess (27 03/04) → 2E → повторная сверка (B09).
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-700">Applied Model:</span>
                <input
                  type="text"
                  maxLength={7}
                  disabled={eyesightWritePending.writeMode === "custom-35xx"}
                  value={eyesightWritePending.appliedModel}
                  onChange={(e) =>
                    setEyesightWritePending({
                      ...eyesightWritePending,
                      appliedModel: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7),
                    })
                  }
                  className="mt-0.5 w-full rounded border border-gray-400 bg-white px-2.5 py-1.5 font-mono text-sm font-bold uppercase disabled:bg-gray-100"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-700">Option Code:</span>
                <input
                  type="text"
                  maxLength={4}
                  disabled={eyesightWritePending.writeMode === "custom-35xx"}
                  value={eyesightWritePending.optionCode}
                  onChange={(e) =>
                    setEyesightWritePending({
                      ...eyesightWritePending,
                      optionCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4),
                    })
                  }
                  className="mt-0.5 w-full rounded border border-gray-400 bg-white px-2.5 py-1.5 font-mono text-sm font-bold uppercase disabled:bg-gray-100"
                />
              </label>
            </div>
            <div className="rounded-lg bg-violet-50 p-2.5 font-mono text-xs text-violet-950 border border-violet-200 space-y-1">
              <div>Applied Model : <strong>{eyesightWritePending.appliedModel}</strong></div>
              <div>Option Code   : <strong>{eyesightWritePending.optionCode}</strong></div>
              {modalPlannedEyesightPreview.length > 0 ? (
                <div className="max-h-24 overflow-y-auto text-[10px] text-violet-900 pt-1 border-t border-violet-200">
                  Будет записано ({modalPlannedEyesightPreview.length} DID):{" "}
                  {modalPlannedEyesightPreview.join(", ")}
                </div>
              ) : (
                <div className="text-[11px] text-rose-700 font-sans">
                  Внимание: для {eyesightWritePending.appliedModel}+{eyesightWritePending.optionCode} нет строки в Y-Yw — выберите режим «Только регион (3502)» или код из Y-Yw.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEyesightWritePending(null)}
                className="rounded-xl border border-gray-300 bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-900"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={
                  eyesightWritePending.appliedModel.trim().length !== 7 ||
                  eyesightWritePending.optionCode.trim().length !== 4 ||
                  modalPlannedEyesightPreview.length === 0
                }
                onClick={() => void executeEyesightVariantWrite()}
                className="rounded-xl bg-violet-900 hover:bg-violet-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {eyesightWritePending.writeMode === "custom-35xx"
                  ? "OK — восстановить EyeSight"
                  : "OK — загрузить в EyeSight"}
              </button>
            </div>
          </div>
        </div>
      )}

      {meter12WritePending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setMeter12WritePending(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-blue-900 bg-white p-5 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-lg bg-blue-900 px-3 py-1.5 text-xs font-bold text-white flex items-center justify-between">
              <span>
                {meter12WritePending.writeMode === "custom-a0xx"
                  ? "Восстановление оригинала из бэкапа"
                  : meter12WritePending.writeMode === "full-cgdw"
                    ? "Полная запись всех DID (как SSM4)"
                    : "Перевод на °C (2 DID: A002 + A011)"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-700">Applied Model (7 симв.):</span>
                <input
                  type="text"
                  maxLength={7}
                  disabled={meter12WritePending.writeMode === "custom-a0xx"}
                  value={meter12WritePending.appliedModel}
                  onChange={(e) =>
                    setMeter12WritePending({
                      ...meter12WritePending,
                      appliedModel: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7),
                    })
                  }
                  className="mt-0.5 w-full rounded border border-gray-400 bg-white px-2.5 py-1.5 font-mono text-sm font-bold uppercase disabled:bg-gray-100"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-700">Option Code (4 симв.):</span>
                <input
                  type="text"
                  maxLength={4}
                  disabled={meter12WritePending.writeMode === "custom-a0xx"}
                  value={meter12WritePending.optionCode}
                  onChange={(e) =>
                    setMeter12WritePending({
                      ...meter12WritePending,
                      optionCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4),
                    })
                  }
                  className="mt-0.5 w-full rounded border border-gray-400 bg-white px-2.5 py-1.5 font-mono text-sm font-bold uppercase disabled:bg-gray-100"
                />
              </label>
            </div>
            <div className="rounded-lg bg-blue-50 p-2.5 font-mono text-xs text-blue-950 border border-blue-200 space-y-1">
              <div>Applied Model : <strong>{meter12WritePending.appliedModel}</strong></div>
              <div>Option Code   : <strong>{meter12WritePending.optionCode}</strong></div>
              <div>
                Режим записи  :{" "}
                <strong>
                  {meter12WritePending.writeMode === "custom-a0xx"
                    ? "Бэкап оригинала (custom-a0xx)"
                    : meter12WritePending.writeMode === "full-cgdw"
                      ? "Полная маска SSM4 cgdw"
                      : "Безопасный минимум (2 DID: A002+A011)"}
                </strong>
              </div>
              {modalPlannedA0xxPreview.length > 0 ? (
                <div className="max-h-24 overflow-y-auto text-[10px] text-blue-900 pt-1 border-t border-blue-200">
                  Будет записано ({modalPlannedA0xxPreview.length} DID):{" "}
                  {modalPlannedA0xxPreview.join(", ")}
                </div>
              ) : (
                <div className="text-[11px] text-rose-700 font-sans">
                  Внимание: для {meter12WritePending.appliedModel}+{meter12WritePending.optionCode} нет строки в справочнике cgdw — выберите режим «Только 2 DID» или код из таблицы.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMeter12WritePending(null)}
                className="rounded-xl border border-gray-300 bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-900"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={
                  meter12WritePending.appliedModel.trim().length !== 7 ||
                  meter12WritePending.optionCode.trim().length !== 4 ||
                  modalPlannedA0xxPreview.length === 0
                }
                onClick={() => void executeMeter12Write()}
                className="rounded-xl bg-blue-900 hover:bg-blue-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {meter12WritePending.writeMode === "custom-a0xx"
                  ? "OK — восстановить оригинал"
                  : "OK — записать в приборку"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
