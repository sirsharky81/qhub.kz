"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  SUBARU_OBD_SUPPORTED_MODELS_SUMMARY,
  checkSubaruObdConversionSupport,
  decodeSubaruAppliedModel12Columns,
  diffEyesightAgainstAppliedCatalog,
  diffMeterAgainstAppliedCatalog,
  explainEyesightOptionInput,
  getSsm4CgdwWriteDids,
  getSsm4YywSchemaForModel,
  getSsm4YywWriteDids,
  isSsm4YywWildcardOption,
  resolveDualXModeRecommendation,
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

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below for iOS Safari / restricted contexts */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

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
  const [busyActionLabel, setBusyActionLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [envLines, setEnvLines] = useState<string[] | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Meter 12-column state
  const [appliedModelInput, setAppliedModelInput] = useState("BTAEYR8");
  const [optionCodeInput, setOptionCodeInput] = useState("U45D");
  const [stickerOptionInput, setStickerOptionInput] = useState("U45L");
  const [meterWriteMode, setMeterWriteMode] = useState<"two-did" | "full-cgdw">("two-did");
  const [presetDualOnly, setPresetDualOnly] = useState(false);
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
  const [eyesightLogCopied, setEyesightLogCopied] = useState(false);
  const [eyesightWriteLogCopied, setEyesightWriteLogCopied] = useState(false);
  const [meterWriteLogCopied, setMeterWriteLogCopied] = useState(false);
  const [meterReadCopied, setMeterReadCopied] = useState(false);
  const meterWriteResultRef = useRef<HTMLDivElement | null>(null);
  const eyesightWriteResultRef = useRef<HTMLDivElement | null>(null);
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
    const absent309x = eyesightRead.dids.filter(
      (d) => /^309[1-9A-D]$/.test(d.did) && d.hex === "--",
    ).length;
    const activeSchema =
      eyesightRead.match.schema ??
      (legacy309x > 0 && present35xx === 0 ? "309x" : "35xx");
    const activePresent = activeSchema === "309x" ? legacy309x : present35xx;
    const activeAbsent = activeSchema === "309x" ? absent309x : absent35xx;
    const activeTotal = activeSchema === "309x" ? 13 : 16;
    const didRangeLabel = activeSchema === "309x" ? "3091..309D" : "3501..3510";
    return {
      present35xx,
      absent35xx,
      legacy309x,
      absent309x,
      activeSchema,
      activePresent,
      activeAbsent,
      activeTotal,
      didRangeLabel,
    };
  }, [eyesightRead]);

  const closestEyesightCatalogRow = useMemo(() => {
    if (!eyesightCatalogDiff.length) return null;
    if (!eyesightReadStats || eyesightReadStats.activePresent === 0) return null;
    return eyesightCatalogDiff.reduce((best, row) =>
      row.diffs.length < best.diffs.length ? row : best,
    );
  }, [eyesightCatalogDiff, eyesightReadStats]);

  const loadedEyesightBackupDiff = useMemo(() => {
    if (!loadedEyesightBackup || !eyesightRead) return null;
    return diffBackupVsLiveEyesight(loadedEyesightBackup, eyesightRead.dids);
  }, [loadedEyesightBackup, eyesightRead]);

  const modalEyesightInputGuide = useMemo(() => {
    if (!eyesightWritePending) return null;
    return explainEyesightOptionInput(
      eyesightWritePending.appliedModel,
      eyesightWritePending.optionCode,
    );
  }, [eyesightWritePending]);

  const modalEyesightSupport = useMemo(() => {
    if (!eyesightWritePending) return null;
    return checkSubaruObdConversionSupport(eyesightWritePending.appliedModel);
  }, [eyesightWritePending]);

  const modalMeterSupport = useMemo(() => {
    if (!meter12WritePending) return null;
    return checkSubaruObdConversionSupport(meter12WritePending.appliedModel);
  }, [meter12WritePending]);

  const modalPlannedEyesightPreview = useMemo(() => {
    if (!eyesightWritePending) return [];
    if (eyesightWritePending.writeMode === "custom-35xx") {
      return (eyesightWritePending.customWrites ?? []).map((w) => `${w.did}=${w.byteHex}`);
    }
    const schema =
      getSsm4YywSchemaForModel(eyesightWritePending.appliedModel) ??
      eyesightRead?.match.schema ??
      "35xx";
    if (eyesightWritePending.writeMode === "region-only") {
      const list = getSsm4YywWriteDids(
        eyesightWritePending.appliedModel,
        eyesightWritePending.optionCode,
      );
      if (schema === "309x") {
        const b3094 = list?.find((w) => w.did === "3094")?.byteHex;
        if (b3094) return [`3094=${b3094}`];
        const dest = eyesightWritePending.optionCode.slice(0, 2);
        const fallback =
          dest === "C0" || dest === "C5"
            ? "03"
            : dest === "U4" || dest === "U5" || dest === "U7"
              ? "02"
              : null;
        return fallback ? [`3094=${fallback}`] : [];
      }
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
  }, [eyesightWritePending, eyesightRead]);

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

  const eyesightInputGuide = useMemo(
    () =>
      explainEyesightOptionInput(
        appliedModelInput || meter12Read?.match.actualAppliedModel || "BTAEYR8",
        optionCodeInput,
        appliedModelAnalysis.cgdwOptionCodes,
        eyesightRead?.match.schema ?? null,
      ),
    [
      appliedModelInput,
      meter12Read,
      optionCodeInput,
      appliedModelAnalysis.cgdwOptionCodes,
      eyesightRead?.match.schema,
    ],
  );

  const ready = phase !== "idle";

  const handleReadMeter12Column = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setBusyActionLabel("Чтение приборки (783)…");
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
      setBusyActionLabel(null);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy, stickerOptionInput]);

  const handleReadEyesightOnly = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setBusyActionLabel("Чтение EyeSight (787)…");
    setError(null);
    try {
      const hintApp = meter12Read?.match.actualAppliedModel || appliedModelInput;
      const result = await sessionRef.current.readSubaruEyesightVariantCode(
        "6",
        hintApp,
        meter12SecurityKeyInput.trim() || undefined,
      );
      setEyesightRead(result);
      if (!meter12Read) {
        const currentInputSchema = getSsm4YywSchemaForModel(appliedModelInput);
        const firstCandidateApp =
          result.match.candidates[0]?.split("+")[0]?.trim().toUpperCase() ?? null;
        const resolvedApp =
          result.match.appliedModel && result.match.appliedModel.length === 7
            ? result.match.appliedModel
            : firstCandidateApp &&
                firstCandidateApp.length === 7 &&
                currentInputSchema !== result.match.schema
              ? firstCandidateApp
              : null;
        if (resolvedApp) {
          setAppliedModelInput(resolvedApp);
        }
        const effectiveApp = resolvedApp ?? appliedModelInput;
        if (
          result.match.optionCode &&
          result.match.optionCode.length === 4 &&
          !isSsm4YywWildcardOption(result.match.optionCode)
        ) {
          setOptionCodeInput(result.match.optionCode);
        } else if (effectiveApp && result.match.optionCode) {
          const guide = explainEyesightOptionInput(
            effectiveApp,
            result.match.optionCode,
            undefined,
            result.match.schema,
          );
          if (result.match.destinationHint === "CANADA" && guide.recommendedCanadaInput) {
            setOptionCodeInput(guide.recommendedCanadaInput);
          } else if (result.match.destinationHint === "USA" && guide.recommendedUsInputs[0]) {
            setOptionCodeInput(guide.recommendedUsInputs[0]);
          }
        }
      }
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
      setBusyActionLabel(null);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy, meter12Read, appliedModelInput, meter12SecurityKeyInput, stickerOptionInput]);

  const handleCompareMeterEyesight = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setBusyActionLabel("Сравнение 783 ↔ 787…");
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
      setBusyActionLabel(null);
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
    setBusyActionLabel(`Запись EyeSight (${pending.appliedModel}+${pending.optionCode})…`);
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
          detectedSchema: eyesightRead?.match.schema,
        },
      );
      setEyesightWriteResult(result);
      requestAnimationFrame(() => {
        eyesightWriteResultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
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
      setBusyActionLabel(null);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy, eyesightWritePending, meter12SecurityKeyInput, eyesightRead]);

  const executeMeter12Write = useCallback(async () => {
    if (!ready || busy || !meter12WritePending) return;
    const pending = meter12WritePending;
    if (pending.appliedModel.trim().length !== 7 || pending.optionCode.trim().length !== 4) return;
    setMeter12WritePending(null);
    setBusy(true);
    setBusyActionLabel(`Запись приборки (${pending.appliedModel}+${pending.optionCode})…`);
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
      requestAnimationFrame(() => {
        meterWriteResultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      if (!result.success) {
        setError(result.steps.at(-1) ?? "Запись не подтверждена приборкой.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка записи приборки");
    } finally {
      setBusy(false);
      setBusyActionLabel(null);
      setPhase(sessionRef.current.phase);
    }
  }, [ready, busy, meter12WritePending, meter12SecurityKeyInput]);

  useEffect(() => {
    if (!eyesightWritePending && !meter12WritePending) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEyesightWritePending(null);
        setMeter12WritePending(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [eyesightWritePending, meter12WritePending]);

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
                SSM4 спрашивает Applied Model как ключ к cgdw (приборка A0xx) и Y-Yw (EyeSight 35xx / 309x) — в ЭБУ уходит маска, не ASCII 7+4.
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

          {(meter12Read || eyesightRead) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {meter12Read && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <div className="text-[10px] font-bold uppercase text-amber-900">
                    Приборка (cgdw → A0xx)
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-gray-900">
                    {meter12Read.match.actualAppliedModel} + {meter12Read.match.actualOptionCode}
                  </div>
                  <div className="text-[11px] text-amber-900">{meter12Read.match.actualRegion}</div>
                </div>
              )}
              {eyesightRead && (
                <div
                  className={`rounded-xl border p-3 ${
                    eyesightReadStats && eyesightReadStats.activePresent > 0
                      ? "border-violet-300 bg-violet-50"
                      : "border-rose-300 bg-rose-50"
                  }`}
                >
                  <div
                    className={`text-[10px] font-bold uppercase ${
                      eyesightReadStats && eyesightReadStats.activePresent > 0
                        ? "text-violet-900"
                        : "text-rose-900"
                    }`}
                  >
                    EyeSight (Y-Yw → {eyesightReadStats?.didRangeLabel ?? "3501..3510"})
                  </div>
                  {eyesightReadStats && eyesightReadStats.activePresent > 0 ? (
                    <>
                      <div className="mt-1 font-mono text-base font-bold text-gray-900">
                        {(eyesightRead.match.appliedModel ??
                          meter12Read?.match.actualAppliedModel ??
                          appliedModelInput) ||
                          "—"}{" "}
                        + {eyesightRead.match.optionCode ?? "—"}
                      </div>
                      <div className="text-[11px] text-violet-900">
                        {eyesightRead.match.destinationHint} (
                        {eyesightRead.match.destinationDid ??
                          (eyesightReadStats.activeSchema === "309x" ? "3094" : "3502")}
                        ={eyesightRead.match.destinationByte ?? eyesightRead.match.byte3502 ?? "—"}) ·{" "}
                        {eyesightReadStats.activePresent}/{eyesightReadStats.activeTotal} DID
                        {closestEyesightCatalogRow
                          ? closestEyesightCatalogRow.diffs.length === 0
                            ? " · 100% в Y-Yw"
                            : ` · отличий от ${closestEyesightCatalogRow.optionCode}: ${closestEyesightCatalogRow.diffs.length}`
                          : ""}
                      </div>
                    </>
                  ) : eyesightReadStats && eyesightReadStats.legacy309x > 0 ? (
                    <>
                      <div className="mt-1 font-mono text-base font-bold text-gray-900">
                        Legacy EyeSight ({eyesightReadStats.legacy309x}/13 DID)
                      </div>
                      <div className="text-[11px] text-violet-900">
                        Считаны вариантные DID 3091..309D (3501..3510 блоком не поддерживаются)
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mt-1 font-mono text-sm font-bold text-rose-950">
                        Не считан (0/{eyesightReadStats?.activeTotal ?? 16} DID)
                      </div>
                      <div className="text-[11px] text-rose-800">
                        {eyesightRead.securityAccessRequired
                          ? "Требуется SecurityAccess / разблокировка CGW — см. журнал ниже"
                          : `EyeSight не ответил на ${eyesightReadStats?.didRangeLabel ?? "3501..3510"} — см. журнал ниже`}
                      </div>
                    </>
                  )}
                </div>
              )}
              {meter12Read && (
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
              )}
              {meter12Read &&
                (() => {
                  const dx =
                    meter12Read.match.dualXModeRecommendation ??
                    resolveDualXModeRecommendation(
                      meter12Read.match.actualAppliedModel,
                      meter12Read.match.actualOptionCode,
                    );
                  if (!dx.supported) return null;
                  return (
                    <div
                      className={`rounded-xl border p-3 ${
                        dx.alreadyHasDualXMode
                          ? "border-teal-300 bg-teal-50"
                          : "border-cyan-300 bg-cyan-50"
                      } ${eyesightRead ? "" : "sm:col-span-2"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-bold uppercase text-cyan-950">
                          {dx.alreadyHasDualXMode
                            ? "X-Mode статус (Dual X-Mode)"
                            : "Рекомендация °C + Dual X-Mode"}
                        </div>
                        <span className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-cyan-900 border border-cyan-200">
                          {dx.currentXModeLabelRu}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-base font-bold text-cyan-950">
                        {dx.appliedModel} + {dx.canadianOptionCode}
                      </div>
                      <div className="mt-0.5 text-[11px] text-cyan-900">{dx.noteRu}</div>
                      {!dx.alreadyHasDualXMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedModelInput(dx.appliedModel);
                            setOptionCodeInput(dx.canadianOptionCode);
                            setMeterWriteMode("full-cgdw");
                          }}
                          className="mt-2 rounded-lg bg-cyan-800 hover:bg-cyan-900 px-3 py-1.5 text-[11px] font-bold text-white"
                        >
                          Подставить {dx.appliedModel} + {dx.canadianOptionCode} (Dual X-Mode · Все DID)
                        </button>
                      )}
                    </div>
                  );
                })()}
            </div>
          )}

          {meter12Read && meterCatalogDiff.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-gray-900">
                  Полное чтение SSM4 (mHZ + cgdw) против справочника для{" "}
                  {meter12Read.match.actualAppliedModel}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {meterReadStats && (
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-700">
                      Активных A0xx: {meterReadStats.presentA0xx} · Отсутствуют (--):{" "}
                      {meterReadStats.absentA0xx} · Карты:{" "}
                      {meterReadStats.bitmaps.join(", ") || "—"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const lines = [
                        `Meter ${meter12Read.txHex}→${meter12Read.rxHex}`,
                        `VIN: ${meter12Read.vin ?? "—"}`,
                        `Applied+Option: ${meter12Read.match.actualAppliedModel}+${meter12Read.match.actualOptionCode} (${meter12Read.match.actualRegion})`,
                        ...meter12Read.dids.map((d) => `${d.did}=${d.hex}`),
                      ];
                      void copyTextToClipboard(lines.join("\n")).then((ok) => {
                        if (ok) {
                          setMeterReadCopied(true);
                          setTimeout(() => setMeterReadCopied(false), 2000);
                        }
                      });
                    }}
                    className="rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-800"
                  >
                    {meterReadCopied ? "Скопировано ✓" : "Копировать дамп"}
                  </button>
                </div>
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
                  ({meterEyesightCompare.eyesight.match.destinationDid ?? "3502"}→
                  {meterEyesightCompare.compare.eyesightRegion})
                </div>
              </div>
              <div className="text-[11px] text-gray-700">{meterEyesightCompare.compare.detailRu}</div>
              {meterEyesightCompare.compare.regionsAligned === false && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!ready || busy || !appliedModelAnalysis.obdConversionSupport.allowObdWrite}
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

          {/* EyeSight ADA-032 / Legacy 309x Full Read vs Y-Yw Catalog + Backup & Sync */}
          {eyesightRead && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-violet-950">
                  EyeSight {eyesightRead.txHex}→{eyesightRead.rxHex} (
                  {eyesightReadStats?.activeSchema === "309x"
                    ? "Legacy 3091..309D · Y-Yw"
                    : "ADA-032 Confirm on Parameter · Y-Yw"}
                  )
                </div>
                {eyesightReadStats && (
                  <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[10px] text-violet-900 border border-violet-200">
                    {eyesightReadStats.didRangeLabel}: {eyesightReadStats.activePresent}/
                    {eyesightReadStats.activeTotal} · Пропуски (--):{" "}
                    {eyesightReadStats.activeAbsent}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-violet-200 bg-white p-2.5">
                  <div className="text-[10px] font-bold uppercase text-violet-800">
                    Распознано из Y-Yw (Model + Option)
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-gray-900">
                    {eyesightReadStats && eyesightReadStats.activePresent > 0
                      ? `${eyesightRead.match.appliedModel ?? meter12Read?.match.actualAppliedModel ?? appliedModelInput ?? "—"} + ${eyesightRead.match.optionCode ?? "—"}`
                      : "— + — (нет данных с блока)"}
                  </div>
                  <div className="text-[11px] text-violet-900">
                    {eyesightRead.match.explanationRu}
                  </div>
                </div>
                <div className="rounded-lg border border-violet-200 bg-white p-2.5 font-mono text-[10px] text-gray-800 break-all">
                  <div className="font-sans text-[10px] font-bold uppercase text-violet-800 mb-0.5">
                    Считанные {eyesightReadStats?.activeTotal ?? 16} DID (
                    {eyesightReadStats?.didRangeLabel ?? "3501..3510"})
                  </div>
                  {eyesightRead.dids
                    .filter((d) =>
                      eyesightReadStats?.activeSchema === "309x"
                        ? /^309[1-9A-D]$/.test(d.did)
                        : /^35(0[1-9A-F]|10)$/.test(d.did),
                    )
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
                    {eyesightReadStats && eyesightReadStats.activePresent === 0 ? (
                      <span className="ml-1.5 font-semibold text-rose-700">
                        (блок не отдал DID 0/{eyesightReadStats.activeTotal} — ниже показан только эталон справочника)
                      </span>
                    ) : closestEyesightCatalogRow ? (
                      <span className="ml-1.5 font-normal text-gray-600">
                        ({closestEyesightCatalogRow.diffs.length === 0 ? "точное совпадение" : "ближе всего"}:{" "}
                        <strong className="font-mono">{closestEyesightCatalogRow.optionCode}</strong>, отличий:{" "}
                        {closestEyesightCatalogRow.diffs.length})
                      </span>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="text-gray-600">
                        <tr>
                          <th className="px-2 py-1">Option (Y-Yw)</th>
                          <th className="px-2 py-1">
                            Отличия от EyeSight ({eyesightReadStats?.didRangeLabel ?? "3501..3510"})
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {eyesightCatalogDiff.map((row) => {
                          const isClosest =
                            closestEyesightCatalogRow &&
                            closestEyesightCatalogRow.optionCode === row.optionCode;
                          const isExactMatch =
                            Boolean(isClosest) && row.diffs.length === 0 && row.identical;
                          const totalSlots = eyesightReadStats?.activeTotal ?? 16;
                          return (
                            <tr
                              key={row.optionCode}
                              className={`border-t border-gray-100 align-top ${
                                isExactMatch
                                  ? "bg-emerald-50/70"
                                  : isClosest
                                    ? "bg-violet-50/70"
                                    : ""
                              }`}
                            >
                              <td className="px-2 py-1 font-mono font-bold whitespace-nowrap">
                                {row.optionCode}
                                {isExactMatch ? (
                                  <span className="ml-1 rounded bg-emerald-200 px-1 py-0.5 text-[9px] text-emerald-950">
                                    совпадает {totalSlots}/{totalSlots}
                                  </span>
                                ) : isClosest ? (
                                  <span className="ml-1 rounded bg-violet-200 px-1 py-0.5 text-[9px] text-violet-950">
                                    ближе всего
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-2 py-1 font-mono">
                                {row.unreadSlots >= totalSlots
                                  ? `нет данных с EyeSight (0/${totalSlots})`
                                  : row.diffs.length === 0
                                    ? row.identical
                                      ? `совпадает целиком (${totalSlots}/${totalSlots})`
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
                <details
                  open={eyesightReadStats?.activePresent === 0}
                  className="text-[10px] text-gray-700"
                >
                  <summary className="cursor-pointer font-semibold text-violet-900">
                    Журнал чтения EyeSight ({eyesightRead.steps.length})
                  </summary>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const txt = [
                          `EyeSight ${eyesightRead.txHex}→${eyesightRead.rxHex}`,
                          `VIN: ${eyesightRead.vin ?? "—"}`,
                          `Match: ${eyesightRead.match.appliedModel ?? "—"}+${eyesightRead.match.optionCode ?? "—"}`,
                          ...(eyesightRead.steps ?? []),
                        ].join("\n");
                        void copyTextToClipboard(txt).then((ok) => {
                          if (ok) {
                            setEyesightLogCopied(true);
                            setTimeout(() => setEyesightLogCopied(false), 2000);
                          }
                        });
                      }}
                      className="rounded border border-violet-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-violet-900 hover:bg-violet-50"
                    >
                      {eyesightLogCopied ? "Скопировано ✓" : "Копировать журнал"}
                    </button>
                  </div>
                  <ul className="mt-1 max-h-48 overflow-y-auto space-y-0.5 font-mono pl-3">
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
                  3. EyeSight (787) — синхронизация региона, загрузка{" "}
                  {eyesightInputGuide.schema === "309x" ? "Legacy (13 DID)" : "ADA-031 (16 DID)"} и бэкап
                </div>
                <p className="text-[11px] text-violet-900">
                  {eyesightWriteMode === "full-yyw"
                    ? `Полный режим SSM4 Selection of Parameter: пишет все ${eyesightInputGuide.didCount} DID (${eyesightInputGuide.didRange}) из Y-Yw с поддержкой масок (* / _) и побайтово проверяет результат.`
                    : `Безопасный минимум (только регион): меняет только DID ${eyesightInputGuide.destinationDid} (${eyesightInputGuide.schema === "309x" ? "02=США, 03=Канада" : "20/21=США, 30/31=Канада"}), сохраняя остальные заводские байты.`}
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
                  Все {eyesightInputGuide.didCount} DID как SSM4 ({eyesightInputGuide.didRange})
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
                  Только регион ({eyesightInputGuide.destinationDid})
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-[11px] text-violet-950 space-y-1">
              <div className="font-bold">
                Подсказка для EyeSight ({eyesightInputGuide.appliedModel || "—"}):{" "}
                <span className="font-mono text-violet-800">
                  {eyesightInputGuide.didRange} ({eyesightInputGuide.didCount} DID)
                </span>
              </div>
              <div className="text-violet-900 leading-relaxed">{eyesightInputGuide.hintRu}</div>
              {eyesightReadStats &&
                eyesightReadStats.activePresent > 0 &&
                eyesightRead &&
                eyesightRead.match.schema !== eyesightInputGuide.schema && (
                  <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-950">
                    Считанный с машины EyeSight использует схему{" "}
                    <strong>
                      {eyesightRead.match.schema === "309x"
                        ? "309x (13 DID: 3091..309D)"
                        : "35xx (16 DID: 3501..3510)"}
                    </strong>
                    , а в поле ниже выбран {eyesightInputGuide.appliedModel} (
                    {eyesightInputGuide.schema}). Выберите свой код кузова в таблице или введите 7-значный Applied Model со стойки B.
                  </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!ready || busy || !appliedModelAnalysis.obdConversionSupport.allowObdWrite}
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
                disabled={!ready || busy || !appliedModelAnalysis.obdConversionSupport.allowObdWrite}
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
                disabled={!ready || busy || !appliedModelAnalysis.obdConversionSupport.allowObdWrite}
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

          {appliedModelAnalysis.appliedModel.length === 7 &&
            appliedModelAnalysis.obdConversionSupport.status !== "supported" && (
              <div
                className={`rounded-xl border px-3 py-2.5 text-[11px] space-y-1 ${
                  appliedModelAnalysis.obdConversionSupport.status ===
                  "unsupported-needs-disassembly"
                    ? "border-rose-300 bg-rose-50 text-rose-950"
                    : "border-sky-300 bg-sky-50 text-sky-950"
                }`}
              >
                <div className="font-bold">
                  {appliedModelAnalysis.obdConversionSupport.status ===
                  "unsupported-needs-disassembly"
                    ? "⛔ Модель исключена из OBD-сервиса: "
                    : "ℹ️ "}
                  {appliedModelAnalysis.obdConversionSupport.ruleTitleRu}
                </div>
                <div>{appliedModelAnalysis.obdConversionSupport.reasonRu}</div>
              </div>
            )}

          {appliedModelAnalysis.valid && (
            <div
              className={`rounded-xl border px-3 py-2.5 text-[11px] space-y-1.5 ${
                appliedModelAnalysis.validInSsm4Cgdw
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              <div>
                {appliedModelAnalysis.validInSsm4Cgdw
                  ? `Пара в каталоге SSM4 cgdw: OK. Допустимые Option: ${appliedModelAnalysis.cgdwOptionCodes.join(", ") || "—"}.`
                  : `Пары ${appliedModelAnalysis.appliedModel}+${appliedModelAnalysis.optionCode} нет в cgdw SSM4 — запись может быть отклонена. Для °C используйте ${appliedModelAnalysis.canadianOptionCodeC0}. Dual X-Mode = 6-й знак Applied (${appliedModelAnalysis.gradeChar}), не Option Code.`}
              </div>
              {appliedModelAnalysis.dualXModeRecommendation.supported && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-1.5">
                  <span>
                    Режим X-Mode:{" "}
                    <strong>{appliedModelAnalysis.dualXModeRecommendation.currentXModeLabelRu}</strong>
                    {!appliedModelAnalysis.dualXModeRecommendation.alreadyHasDualXMode && (
                      <>
                        {" "}
                        · для <strong>Dual X-Mode + °C</strong> используйте{" "}
                        <code className="font-mono font-bold">
                          {appliedModelAnalysis.dualXModeRecommendation.appliedModel}+
                          {appliedModelAnalysis.dualXModeRecommendation.canadianOptionCode}
                        </code>{" "}
                        и режим «Все DID как SSM4 (cgdw)»
                      </>
                    )}
                  </span>
                  {!appliedModelAnalysis.dualXModeRecommendation.alreadyHasDualXMode && (
                    <button
                      type="button"
                      onClick={() => {
                        const dx = appliedModelAnalysis.dualXModeRecommendation;
                        setAppliedModelInput(dx.appliedModel);
                        setOptionCodeInput(dx.canadianOptionCode);
                        setMeterWriteMode("full-cgdw");
                      }}
                      className="rounded-lg bg-cyan-800 hover:bg-cyan-900 px-2.5 py-1 text-[10px] font-bold text-white"
                    >
                      + Добавить Dual X-Mode ({appliedModelAnalysis.dualXModeRecommendation.appliedModel}+
                      {appliedModelAnalysis.dualXModeRecommendation.canadianOptionCode})
                    </button>
                  )}
                </div>
              )}
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
                disabled={!ready || busy || !appliedModelAnalysis.obdConversionSupport.allowObdWrite}
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
                disabled={!ready || busy || !appliedModelAnalysis.obdConversionSupport.allowObdWrite}
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
                disabled={!ready || busy || !appliedModelAnalysis.obdConversionSupport.allowObdWrite}
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
              ref={eyesightWriteResultRef}
              className={`rounded-xl border p-3 text-xs space-y-1.5 font-mono ${
                eyesightWriteResult.success
                  ? "border-violet-300 bg-violet-50 text-violet-950"
                  : "border-rose-300 bg-rose-50 text-rose-950"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 font-sans">
                <div className="font-bold">
                  {eyesightWriteResult.success
                    ? `✓ EyeSight ADA-031 (${eyesightWriteResult.writeMode}): подтверждено ${eyesightWriteResult.verifiedCount}/${eyesightWriteResult.targetCount} DID (${eyesightWriteResult.appliedModel}+${eyesightWriteResult.optionCode})`
                    : `Запись EyeSight не подтверждена (записано ${eyesightWriteResult.writtenCount}/${eyesightWriteResult.targetCount}, сверено ${eyesightWriteResult.verifiedCount}/${eyesightWriteResult.targetCount})`}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const header = eyesightWriteResult.success
                      ? `EyeSight OK (${eyesightWriteResult.writeMode}): ${eyesightWriteResult.verifiedCount}/${eyesightWriteResult.targetCount} DID (${eyesightWriteResult.appliedModel}+${eyesightWriteResult.optionCode})`
                      : `EyeSight FAIL (${eyesightWriteResult.writeMode}): written=${eyesightWriteResult.writtenCount}/${eyesightWriteResult.targetCount}, verified=${eyesightWriteResult.verifiedCount}/${eyesightWriteResult.targetCount} (${eyesightWriteResult.appliedModel}+${eyesightWriteResult.optionCode})`;
                    const lines = [
                      header,
                      ...(eyesightWriteResult.mismatchedDids.length > 0
                        ? [`Mismatches: ${eyesightWriteResult.mismatchedDids.join("; ")}`]
                        : []),
                      ...eyesightWriteResult.steps,
                    ];
                    void copyTextToClipboard(lines.join("\n")).then((ok) => {
                      if (ok) {
                        setEyesightWriteLogCopied(true);
                        setTimeout(() => setEyesightWriteLogCopied(false), 2000);
                      }
                    });
                  }}
                  className="shrink-0 rounded-lg border border-black/15 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-800 hover:bg-gray-50"
                >
                  {eyesightWriteLogCopied ? "Скопировано ✓" : "Копировать логи"}
                </button>
              </div>
              {eyesightWriteResult.cgwFilterRemoved && (
                <div className="font-sans text-[11px]">CGW FilterRemove: да</div>
              )}
              {eyesightWriteResult.mismatchedDids.length > 0 && (
                <div className="font-sans text-[11px] text-rose-800">
                  Расхождения при повторном чтении: {eyesightWriteResult.mismatchedDids.join("; ")}
                </div>
              )}
              <ul className="max-h-56 overflow-y-auto list-disc pl-4 space-y-0.5 text-[10px]">
                {eyesightWriteResult.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {meter12WriteResult && (
            <div
              ref={meterWriteResultRef}
              className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                meter12WriteResult.success
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-rose-300 bg-rose-50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold">
                  {meter12WriteResult.success
                    ? `✓ Записано DID ${meter12WriteResult.writtenDid}: ${meter12WriteResult.plan.appliedModel} + ${meter12WriteResult.plan.optionCode}`
                    : "Запись остановлена"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const header = meter12WriteResult.success
                      ? `Meter OK (${meter12WriteResult.writtenDid}): ${meter12WriteResult.plan.appliedModel} + ${meter12WriteResult.plan.optionCode}`
                      : `Meter STOP: ${meter12WriteResult.plan.appliedModel} + ${meter12WriteResult.plan.optionCode}`;
                    const afterLine = meter12WriteResult.after
                      ? `После записи считано: ${meter12WriteResult.after.match.inferredAppliedModel} + ${meter12WriteResult.after.match.inferredOptionCode} (${meter12WriteResult.after.match.inferredRegion})`
                      : null;
                    const lines = [
                      header,
                      ...(afterLine ? [afterLine] : []),
                      ...meter12WriteResult.steps,
                    ];
                    void copyTextToClipboard(lines.join("\n")).then((ok) => {
                      if (ok) {
                        setMeterWriteLogCopied(true);
                        setTimeout(() => setMeterWriteLogCopied(false), 2000);
                      }
                    });
                  }}
                  className="shrink-0 rounded-lg border border-black/15 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-800 hover:bg-gray-50"
                >
                  {meterWriteLogCopied ? "Скопировано ✓" : "Копировать логи"}
                </button>
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
              <ul className="max-h-56 overflow-y-auto space-y-0.5 font-mono text-[10px] text-gray-700">
                {meter12WriteResult.steps.map((step, idx) => (
                  <li key={idx}>• {step}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Supported OBD Models vs Excluded / Native Display Reference */}
          <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-[11px] text-slate-800">
            <summary className="cursor-pointer font-bold text-slate-900">
              Какие модели Subaru меняются без разбора по OBD (а какие исключены / имеют переключатель в дисплее)
            </summary>
            <div className="mt-2.5 grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="rounded-lg border border-emerald-200 bg-white p-2.5 space-y-1">
                <div className="font-bold text-emerald-900">✓ Без разбора через OBD (поддерживаются)</div>
                <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                  {SUBARU_OBD_SUPPORTED_MODELS_SUMMARY.obdSupported.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="pt-1 text-[10px] text-slate-500">
                  4-й символ Applied Model / Body Model — буквенное «поколение» (порядковый год выпуска кузова).
                </p>
              </div>
              <div className="rounded-lg border border-sky-200 bg-white p-2.5 space-y-1">
                <div className="font-bold text-sky-900">ℹ️ Есть переключатель °F/°C в настройках дисплея</div>
                <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                  {SUBARU_OBD_SUPPORTED_MODELS_SUMMARY.nativeDisplaySetting.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-rose-200 bg-white p-2.5 space-y-1">
                <div className="font-bold text-rose-900">⛔ Исключены (не меняются без разбора)</div>
                <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                  {SUBARU_OBD_SUPPORTED_MODELS_SUMMARY.excludedNeedsDisassembly.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>

          {/* Presets Table */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-gray-700">
                  Справочник замен из SSM4 cgdw (нажмите — подставить Applied + канадский Option):
                </div>
                <div className="text-[11px] text-gray-500">
                  При выборе пресета с <strong>Dual X-Mode</strong> автоматически включается режим «Все DID как SSM4 (cgdw)» для записи байта X-Mode (A007).
                </div>
              </div>
              <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPresetDualOnly(false)}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    !presetDualOnly
                      ? "bg-gray-900 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Все ({SUBARU_CANADIAN_OPTION_PRESETS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPresetDualOnly(true)}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    presetDualOnly
                      ? "bg-cyan-800 text-white"
                      : "text-gray-700 hover:bg-cyan-50"
                  }`}
                >
                  Только Dual X-Mode
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="px-2.5 py-1.5">Модель</th>
                    <th className="px-2.5 py-1.5">Комплектация</th>
                    <th className="px-2.5 py-1.5">X-Mode</th>
                    <th className="px-2.5 py-1.5">Applied Model</th>
                    <th className="px-2.5 py-1.5">США</th>
                    <th className="px-2.5 py-1.5">Канада (°C)</th>
                    <th className="px-2.5 py-1.5">Dual X-Mode апгрейд</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {SUBARU_CANADIAN_OPTION_PRESETS.filter(
                    (preset) => !presetDualOnly || preset.xModeTypeRu.startsWith("Dual"),
                  ).map((preset) => {
                    const isDual = preset.xModeTypeRu.startsWith("Dual");
                    const dx = resolveDualXModeRecommendation(
                      preset.appliedModel,
                      preset.canadianOptionCodeC0,
                    );
                    const hasUpgrade = dx.supported && !dx.alreadyHasDualXMode;
                    return (
                      <tr
                        key={preset.id}
                        onClick={() => {
                          setAppliedModelInput(preset.appliedModel);
                          setOptionCodeInput(preset.canadianOptionCodeC0);
                          if (isDual) setMeterWriteMode("full-cgdw");
                        }}
                        className="cursor-pointer hover:bg-emerald-50"
                      >
                        <td className="px-2.5 py-1.5 font-semibold text-gray-800">
                          {preset.modelSeriesRu}{" "}
                          <span className="text-gray-500">({preset.years})</span>
                        </td>
                        <td className="px-2.5 py-1.5 text-gray-700">{preset.trimRu}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isDual
                                ? "bg-cyan-100 text-cyan-900"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {isDual ? "Dual X-Mode" : "Single X-Mode"}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-700">
                          <div>{preset.appliedModel}</div>
                          {(() => {
                            const esSchema = getSsm4YywSchemaForModel(preset.appliedModel);
                            if (!esSchema) return null;
                            return (
                              <span
                                className={`mt-0.5 inline-block rounded px-1 py-0.2 font-sans text-[9px] font-semibold ${
                                  esSchema === "309x"
                                    ? "bg-violet-100 text-violet-900"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {esSchema === "309x" ? "ES 309x · 13 DID" : "ES 35xx · 16 DID"}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-gray-500">
                          {preset.usOptionCodeExamples.join(", ")}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-700">
                          {preset.canadianOptionCodeC0}
                        </td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          {hasUpgrade ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAppliedModelInput(dx.appliedModel);
                                setOptionCodeInput(dx.canadianOptionCode);
                                setMeterWriteMode("full-cgdw");
                              }}
                              className="rounded border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-900"
                            >
                              → {dx.appliedModel}+{dx.canadianOptionCode}
                            </button>
                          ) : isDual ? (
                            <span className="text-[10px] font-semibold text-teal-700">
                              ✓ Включён
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

      {/* Live busy status pill rendered in viewport portal */}
      {mounted &&
        busy &&
        busyActionLabel &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900/95 px-4 py-2 text-xs font-semibold text-white shadow-lg">
              <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>{busyActionLabel}</span>
            </div>
          </div>,
          document.body,
        )}

      {/* Clean Confirm Modal without 0205 (portaled outside ObdScrollShell transform so fixed inset-0 stays centered on current viewport) */}
      {mounted &&
        eyesightWritePending &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overscroll-contain"
            role="dialog"
            aria-modal="true"
            onClick={() => setEyesightWritePending(null)}
          >
            <div
              className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-violet-900 bg-white p-5 shadow-xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-lg bg-violet-900 px-3 py-1.5 text-xs font-bold text-white flex items-center justify-between gap-2">
                <span>
                  {eyesightWritePending.writeMode === "custom-35xx"
                    ? "Восстановление оригинала EyeSight из бэкапа"
                    : eyesightWritePending.writeMode === "region-only"
                      ? `EyeSight — запись только региона (DID ${modalEyesightInputGuide?.destinationDid ?? "3502"})`
                      : `EyeSight — Selection of Parameter (SSM4 ${modalEyesightInputGuide?.didRange ?? "3501..3510"} · ${modalEyesightInputGuide?.didCount ?? 16} DID)`}
                </span>
                <button
                  type="button"
                  aria-label="Закрыть"
                  onClick={() => setEyesightWritePending(null)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-white/80 hover:bg-white/15 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-gray-700 leading-relaxed">
                Запись Vehicle Model Registration в блок EyeSight ({eyesightRead?.txHex ?? "787"}).
                Перед записью снимается CGW FilterRemove, затем выполняется 10 03 → SecurityAccess (27 03/04) → 2E → повторная сверка (B09).
              </p>
              {modalEyesightInputGuide && eyesightWritePending.writeMode !== "custom-35xx" && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-2.5 py-1.5 text-[10px] text-violet-950 leading-relaxed">
                  {modalEyesightInputGuide.hintRu}
                </div>
              )}
              {modalEyesightSupport &&
                eyesightWritePending.writeMode !== "custom-35xx" &&
                !modalEyesightSupport.allowObdWrite && (
                  <div className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-[10px] text-rose-900 leading-relaxed">
                    ⛔ {modalEyesightSupport.ruleTitleRu}: {modalEyesightSupport.reasonRu}
                  </div>
                )}
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
                <div>
                  Option Code   : <strong>{eyesightWritePending.optionCode}</strong>
                  {modalEyesightInputGuide?.resolvedCatalogOption &&
                    modalEyesightInputGuide.resolvedCatalogOption !== eyesightWritePending.optionCode && (
                      <span className="ml-1.5 text-[10px] font-sans text-violet-800">
                        (маска Y-Yw: <strong>{modalEyesightInputGuide.resolvedCatalogOption}</strong>)
                      </span>
                    )}
                </div>
                {modalPlannedEyesightPreview.length > 0 ? (
                  <div className="max-h-24 overflow-y-auto text-[10px] text-violet-900 pt-1 border-t border-violet-200">
                    Будет записано ({modalPlannedEyesightPreview.length} DID):{" "}
                    {modalPlannedEyesightPreview.join(", ")}
                  </div>
                ) : (
                  <div className="text-[11px] text-rose-700 font-sans">
                    Внимание: для {eyesightWritePending.appliedModel}+{eyesightWritePending.optionCode} нет строки в Y-Yw — выберите режим «Только регион ({modalEyesightInputGuide?.destinationDid ?? "3502"})» или код из Y-Yw.
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
                    eyesightWritePending.optionCode.trim().length <
                      (modalEyesightInputGuide?.expectedOptionLength ?? 4) ||
                    modalPlannedEyesightPreview.length === 0 ||
                    (eyesightWritePending.writeMode !== "custom-35xx" &&
                      modalEyesightSupport != null &&
                      !modalEyesightSupport.allowObdWrite)
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
          </div>,
          document.body,
        )}

      {mounted &&
        meter12WritePending &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overscroll-contain"
            role="dialog"
            aria-modal="true"
            onClick={() => setMeter12WritePending(null)}
          >
            <div
              className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-blue-900 bg-white p-5 shadow-xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-lg bg-blue-900 px-3 py-1.5 text-xs font-bold text-white flex items-center justify-between gap-2">
                <span>
                  {meter12WritePending.writeMode === "custom-a0xx"
                    ? "Восстановление оригинала из бэкапа"
                    : meter12WritePending.writeMode === "full-cgdw"
                      ? "Полная запись всех DID (как SSM4)"
                      : "Перевод на °C (2 DID: A002 + A011)"}
                </span>
                <button
                  type="button"
                  aria-label="Закрыть"
                  onClick={() => setMeter12WritePending(null)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-white/80 hover:bg-white/15 hover:text-white"
                >
                  ✕
                </button>
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
                {meter12WritePending.writeMode !== "custom-a0xx" &&
                  modalMeterSupport &&
                  !modalMeterSupport.allowObdWrite && (
                    <div className="text-[11px] text-rose-700 font-sans pt-1 border-t border-rose-200">
                      ⛔ {modalMeterSupport.ruleTitleRu}: {modalMeterSupport.reasonRu}
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
                    modalPlannedA0xxPreview.length === 0 ||
                    (meter12WritePending.writeMode !== "custom-a0xx" &&
                      modalMeterSupport != null &&
                      !modalMeterSupport.allowObdWrite)
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
          </div>,
          document.body,
        )}
    </div>
  );
}
