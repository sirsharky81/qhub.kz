"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LiveMetricCards } from "./LiveMetricCards";
import type { CatalogEcu, CatalogSignal, CatalogVehicle, CatalogVehicleSummary } from "@/lib/etacs-coding/diag-catalog";
import { asciiFromKwpPayload, decodeCatalogSignal, extractMitsubishiVin } from "@/lib/obd/mut-live";
import {
  buildMitsubishiVisitReport,
  ecuMatchesServiceSet,
  isTransmissionEcu,
  mitsubishiFluidBand,
  parseMitsubishiModuleIdentity,
  pickPreferredMonitorSignals,
  pickServiceSetSignals,
  type MitsubishiServiceSet,
} from "@/lib/obd/mitsubishi-mut-monitor";
import { remedyForDtcCode } from "@/lib/obd/dtc-remedies";
import {
  ObdBleSession,
  type ModuleDtcReport,
  type ModuleDtcTarget,
  type ObdConnectionPhase,
} from "@/lib/obd/obd-session";
import type { MitsubishiMeterReport, MitsubishiTcmTelemetry } from "@/lib/obd/mitsubishi-modules";
import {
  getMitsubishiProceduresForCatalogEcu,
  getMitsubishiProceduresForEcu,
  type MitsubishiServiceExecutionResult,
  type MitsubishiServicePackageId,
  type MitsubishiServiceProcedure,
} from "@/lib/obd/mitsubishi-service-procedures";

interface Props {
  session: ObdBleSession;
  phase: ObdConnectionPhase;
  /** «faults» — список блоков. «live» — топливо и параметры. «service» — калибровки, сбросы и тесты MUT-III. */
  section?: "live" | "faults" | "service";
  onShowLive?: () => void;
  vinHint?: string | null;
}

interface Sample {
  t: number;
  values: Record<string, number | null>;
}

interface DtcText {
  en: string;
  ru: string;
}

const MAX_LIVE = 16;
const MAX_POINTS = 48;

const PACKAGE_ORDER: MitsubishiServicePackageId[] = [
  "engine",
  "transmission",
  "brakes_chassis",
  "meter_body",
];

const PACKAGE_LABEL: Record<MitsubishiServicePackageId, string> = {
  engine: "Двигатель",
  transmission: "Трансмиссия",
  brakes_chassis: "Тормоза и шасси",
  meter_body: "Приборка и кузов",
};

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function addressKey(tx: string, rx: string): string {
  return `${tx.toUpperCase()}-${rx.toUpperCase()}`;
}

async function readDiagVin(session: ObdBleSession, hint?: string | null): Promise<string | null> {
  const hinted = extractMitsubishiVin(hint);
  try {
    const identity = await session.readVehicleIdentity();
    const fromObd = extractMitsubishiVin(identity.vin);
    if (fromObd) return fromObd;
  } catch {
    /* Mitsubishi often has no Mode 09 VIN */
  }
  const probes: Array<[string, string, string]> = [
    ["7E0", "7E8", "1A 90"],
    ["7E0", "7E8", "21 90"],
    ["7E0", "7E8", "22 F1 90"],
    ["620", "504", "1A 90"],
    ["620", "504", "21 90"],
    ["6A0", "514", "21 90"],
    ["7E1", "7E9", "21 90"],
  ];
  for (const [tx, rx, request] of probes) {
    try {
      const { parsed } = await session.sendUds("6", tx, rx, request, false);
      if (parsed.kind !== "positive") continue;
      const vin = extractMitsubishiVin(parsed.payload) ?? extractMitsubishiVin(asciiFromKwpPayload(parsed.payload));
      if (vin) return vin;
    } catch {
      /* try the next module / service */
    }
  }
  return hinted;
}

export default function MutDiagPanel({ session, phase, section = "live", onShowLive, vinHint }: Props) {
  const [vehicles, setVehicles] = useState<CatalogVehicleSummary[]>([]);
  const [vinMatches, setVinMatches] = useState<CatalogVehicleSummary[]>([]);
  const [vehicle, setVehicle] = useState<CatalogVehicle | null>(null);
  const [vin, setVin] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<Record<string, ModuleDtcReport>>({});
  const [texts, setTexts] = useState<Record<string, Record<string, DtcText>>>({});
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [signals, setSignals] = useState<CatalogSignal[]>([]);
  const [signalQuery, setSignalQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [live, setLive] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [liveNow, setLiveNow] = useState<Record<string, string>>({});
  const stopScan = useRef(false);
  const stopLive = useRef(false);
  const liveRunning = useRef(false);
  const liveMinMaxRef = useRef<Map<string, { min: number; max: number }>>(new Map());
  const [liveMinMaxTick, setLiveMinMaxTick] = useState(0);
  const [tcm, setTcm] = useState<MitsubishiTcmTelemetry | null>(null);
  const [meter, setMeter] = useState<MitsubishiMeterReport | null>(null);
  const tcmLiveRef = useRef(false);
  const [tcmLive, setTcmLive] = useState(false);
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const [selectedSkey, setSelectedSkey] = useState<string | null>(null);
  const [serviceResult, setServiceResult] = useState<MitsubishiServiceExecutionResult | null>(null);

  const catalogStarted = useRef(false);
  const vinAutoTried = useRef(false);
  const vehiclePickedManually = useRef(false);

  useEffect(() => {
    return () => {
      stopScan.current = true;
      stopLive.current = true;
      tcmLiveRef.current = false;
    };
  }, []);

  const selected = vehicle?.ecus.find((ecu) => ecu.sysKey === selectedKey) ?? null;
  const pickedSignals = useMemo(
    () => signals.filter((signal) => picked.includes(signal.id)),
    [signals, picked],
  );
  const availableProcedures = useMemo(
    () =>
      selected && selectedSkey
        ? getMitsubishiProceduresForEcu({
            skey: selectedSkey,
            txCanId: selected.txCanId,
            rxCanId: selected.rxCanId,
          })
        : [],
    [selected, selectedSkey],
  );
  const vehicleProcedures = useMemo(() => {
    if (!vehicle) return [];
    return vehicle.ecus
      .map((ecu) => ({ ecu, procedures: getMitsubishiProceduresForCatalogEcu(ecu) }))
      .filter((group) => group.procedures.length > 0);
  }, [vehicle]);

  const visibleSignals = useMemo(() => {
    const query = signalQuery.trim().toLowerCase();
    const matched = signals.filter((signal) => {
      if (picked.includes(signal.id)) return true;
      if (!query) return true;
      return `${signal.nameRu} ${signal.nameEn}`.toLowerCase().includes(query);
    });
    return matched.slice(0, query ? 40 : 24);
  }, [signals, signalQuery, picked]);

  const loadVehicle = async (query: string) => {
    const response = await fetch(`/api/etacs-coding/diag?${query}`);
    const body = (await response.json()) as {
      error?: string;
      vehicles?: CatalogVehicleSummary[];
      vehicle?: CatalogVehicle | null;
      vinMatches?: CatalogVehicleSummary[];
    };
    if (!response.ok) throw new Error(body.error || "Каталог недоступен");
    setVehicles(body.vehicles ?? []);
    setVinMatches(body.vinMatches ?? []);
    setVehicle(body.vehicle ?? null);
    setReports({});
    setTexts({});
    setSelectedKey(null);
    setSelectedSkey(null);
    setServiceResult(null);
    setSignals([]);
    setPicked([]);
    return { vehicle: body.vehicle ?? null, vinMatches: body.vinMatches ?? [] };
  };

  const identify = async () => {
    setBusy(true);
    setError(null);
    try {
      const found =
        phase === "vehicle" ? await readDiagVin(session, vinHint) : extractMitsubishiVin(vinHint);
      setVin(found);
      const result = await loadVehicle(found ? `vin=${encodeURIComponent(found)}` : "");
      if (result.vehicle) {
        setStatus(`Определено по VIN: ${result.vehicle.nameRu}`);
      } else if (found && result.vinMatches.length > 1) {
        setStatus(`По VIN ${found} подходит несколько моделей — выберите.`);
      } else if (found) {
        setStatus(`VIN ${found} прочитан, модель в каталоге не найдена — выберите вручную.`);
      } else if (phase === "vehicle") {
        setStatus("VIN не прочитан. Включите зажигание или выберите машину.");
      } else {
        setStatus("Подключите vLinker — модель определится по VIN автоматически.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось открыть каталог");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (phase !== "vehicle") {
      vinAutoTried.current = false;
      if (catalogStarted.current) return;
      catalogStarted.current = true;
      void identify();
      return;
    }
    if (vinAutoTried.current || vehiclePickedManually.current) return;
    vinAutoTried.current = true;
    catalogStarted.current = true;
    void identify();
  }, [phase]);

  const chooseVehicle = async (vkey: string) => {
    vehiclePickedManually.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await loadVehicle(`vkey=${encodeURIComponent(vkey)}`);
      setVinMatches([]);
      setStatus(result.vehicle?.nameRu ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось открыть каталог");
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    if (!vehicle) return;
    stopLive.current = true;
    setLive(false);
    stopScan.current = false;
    setBusy(true);
    setError(null);
    const unique = new Map<string, CatalogEcu>();
    for (const ecu of vehicle.ecus) {
      const key = addressKey(ecu.txCanId, ecu.rxCanId);
      if (!unique.has(key)) unique.set(key, ecu);
    }
    const targets: ModuleDtcTarget[] = [...unique.values()].map((ecu) => ({
      tx: Number.parseInt(ecu.txCanId, 16),
      rx: Number.parseInt(ecu.rxCanId, 16),
      title: ecu.nameRu || ecu.nameEn,
      safetyCritical: !ecu.canSafeClear,
      canSafeClear: ecu.canSafeClear,
      mode03Fallback: ecu.txCanId === "7E0" || ecu.txCanId === "7E1",
      mitsubishiKwp: true,
    }));
    try {
      const found = await session.scanCatalogModules(
        "6",
        targets,
        (line, partial) => {
          setStatus(line);
          setReports((prev) => {
            const next = { ...prev };
            for (const report of partial) next[addressKey(report.txHex, report.rxHex)] = report;
            return next;
          });
        },
        () => stopScan.current,
      );
      const nextReports: Record<string, ModuleDtcReport> = {};
      for (const report of found) nextReports[addressKey(report.txHex, report.rxHex)] = report;
      setReports(nextReports);
      await describe(vehicle.ecus, nextReports);
      setStatus(`Опрошено блоков: ${found.length}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Опрос блоков не выполнен");
    } finally {
      setBusy(false);
    }
  };

  const describe = async (ecus: CatalogEcu[], nextReports: Record<string, ModuleDtcReport>) => {
    const byMaster = new Map<string, Set<string>>();
    for (const ecu of ecus) {
      const report = nextReports[addressKey(ecu.txCanId, ecu.rxCanId)];
      if (!report || report.dtcs.length === 0) continue;
      const bucket = byMaster.get(ecu.dtcMasterId) ?? new Set<string>();
      for (const dtc of report.dtcs) bucket.add(dtc.code);
      byMaster.set(ecu.dtcMasterId, bucket);
    }
    const next: Record<string, Record<string, DtcText>> = {};
    for (const [dtcMasterId, codes] of byMaster) {
      const response = await fetch("/api/etacs-coding/diag/dtc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dtcMasterId, codes: [...codes].slice(0, 80) }),
      });
      if (!response.ok) continue;
      const body = (await response.json()) as { descriptions?: Record<string, DtcText> };
      next[dtcMasterId] = body.descriptions ?? {};
    }
    setTexts(next);
  };

  const scanSingleEcu = async (ecu: CatalogEcu) => {
    if (phase !== "vehicle" || busy) return;
    stopLive.current = true;
    setLive(false);
    stopScan.current = false;
    setBusy(true);
    setError(null);
    const target: ModuleDtcTarget = {
      tx: Number.parseInt(ecu.txCanId, 16),
      rx: Number.parseInt(ecu.rxCanId, 16),
      title: ecu.nameRu || ecu.nameEn,
      safetyCritical: !ecu.canSafeClear,
      canSafeClear: ecu.canSafeClear,
      mode03Fallback: ecu.txCanId === "7E0" || ecu.txCanId === "7E1",
      mitsubishiKwp: true,
    };
    try {
      setStatus(`Опрос «${ecu.nameRu}» (${ecu.txCanId}→${ecu.rxCanId})…`);
      const found = await session.scanCatalogModules("6", [target]);
      const report = found[0];
      if (report) {
        const key = addressKey(report.txHex, report.rxHex);
        const merged = { ...reports, [key]: report };
        setReports(merged);
        if (vehicle) await describe(vehicle.ecus, merged);
        setStatus(
          report.responded
            ? `${ecu.nameRu}: ${report.dtcs.length} ошибок`
            : `${ecu.nameRu}: нет ответа (блок не установлен или зажигание выключено)`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Опрос блока не выполнен");
    } finally {
      setBusy(false);
    }
  };

  const clearEcu = async (ecu: CatalogEcu) => {
    if (!ecu.canSafeClear) return;
    const confirmed = window.confirm(`Сбросить ошибки блока «${ecu.nameRu}» (${ecu.txCanId}→${ecu.rxCanId})?`);
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const message = await session.clearModuleDtcsSafe("6", ecu.txCanId, ecu.rxCanId);
      const key = addressKey(ecu.txCanId, ecu.rxCanId);
      setReports((prev) => {
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            dtcs: [],
            rawStatus: "0 ошибок (после сброса)",
          },
        };
      });
      setStatus(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Сброс не выполнен");
    } finally {
      setBusy(false);
    }
  };

  const readModuleIdentity = async (tx: string, rx: string) => {
    const cachedReport = reports[addressKey(tx, rx)];
    if (cachedReport?.partNumber && cachedReport?.diagVersion) {
      return { partNumber: cachedReport.partNumber, diagVersion: cachedReport.diagVersion };
    }
    const readOnce = async () => {
      let partNumber: string | null = cachedReport?.partNumber ?? null;
      let diagVersion: string | null = cachedReport?.diagVersion ?? null;
      for (const request of ["1A 87", "1A 9C", "21 87", "1A 86"]) {
        if (partNumber && diagVersion) break;
        try {
          const { parsed } = await session.sendUds("6", tx, rx, request, false);
          if (parsed.kind !== "positive") continue;
          const identity = parseMitsubishiModuleIdentity(request, parsed.payload);
          partNumber = partNumber ?? identity.partNumber ?? identity.softwarePartNumber ?? null;
          diagVersion = diagVersion ?? identity.diagVersion;
        } catch {
          /* the next identification request */
        }
      }
      return { partNumber, diagVersion };
    };
    let identity = await readOnce();
    if (!identity.partNumber && !identity.diagVersion) {
      try {
        await session.sendUds("6", tx, rx, "10 92", false);
      } catch {
        try {
          await session.sendUds("6", tx, rx, "10 C0", false);
        } catch {
          /* identification still falls back to the catalog profile */
        }
      }
      identity = await readOnce();
    }
    return identity;
  };

  const openEcu = async (ecu: CatalogEcu, serviceSet?: MitsubishiServiceSet) => {
    stopLive.current = true;
    setLive(false);
    setSelectedKey(ecu.sysKey);
    setSelectedSkey(null);
    setServiceResult(null);
    setSignalQuery("");
    setPicked([]);
    setSamples([]);
    setLiveNow({});
    setSignals([]);
    setProfileNote(null);
    if (!vehicle) return;
    try {
      let diagVersion: string | null = null;
      let partNumber: string | null = null;
      if (phase === "vehicle") {
        setStatus("Читаю парт-номер и версию блока…");
        const identity = await readModuleIdentity(ecu.txCanId, ecu.rxCanId);
        diagVersion = identity.diagVersion;
        partNumber = identity.partNumber;
      }
      const query = new URLSearchParams({
        vkey: vehicle.vkey,
        sysKey: String(ecu.sysKey),
      });
      if (diagVersion) query.set("diagVersion", diagVersion);
      if (partNumber) query.set("partNumber", partNumber);
      const response = await fetch(`/api/etacs-coding/diag/signals?${query.toString()}`);
      const body = (await response.json()) as {
        error?: string;
        skey?: string;
        signals?: CatalogSignal[];
        profileNoteRu?: string;
      };
      if (!response.ok) throw new Error(body.error || "Список параметров недоступен");
      const list = body.signals ?? [];
      setSelectedSkey(body.skey ?? null);
      setSignals(list);
      setProfileNote(body.profileNoteRu ?? null);
      const serviceIds = serviceSet ? pickServiceSetSignals(list, serviceSet, MAX_LIVE) : [];
      setPicked(serviceIds.length > 0 ? serviceIds : pickPreferredMonitorSignals(list, MAX_LIVE));
      setStatus(null);
      requestAnimationFrame(() => {
        document.getElementById("mitsu-live-workspace")?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Список параметров недоступен");
    }
  };

  const resolveSkeyForEcu = async (ecu: CatalogEcu): Promise<string> => {
    if (selectedKey === ecu.sysKey && selectedSkey) return selectedSkey;
    if (!vehicle) throw new Error("Сначала выберите автомобиль из каталога.");
    let diagVersion: string | null = null;
    let partNumber: string | null = null;
    if (phase === "vehicle") {
      setStatus("Читаю парт-номер и версию блока…");
      const identity = await readModuleIdentity(ecu.txCanId, ecu.rxCanId);
      diagVersion = identity.diagVersion;
      partNumber = identity.partNumber;
    }
    const query = new URLSearchParams({
      vkey: vehicle.vkey,
      sysKey: String(ecu.sysKey),
    });
    if (diagVersion) query.set("diagVersion", diagVersion);
    if (partNumber) query.set("partNumber", partNumber);
    const response = await fetch(`/api/etacs-coding/diag/signals?${query.toString()}`);
    const body = (await response.json()) as { error?: string; skey?: string };
    if (!response.ok) throw new Error(body.error || "Не удалось определить профиль SKEY блока");
    if (!body.skey) throw new Error("Каталог MUT-III не вернул SKEY для этого блока.");
    return body.skey;
  };

  const runServiceProcedure = async (proc: MitsubishiServiceProcedure, ecu: CatalogEcu) => {
    if (phase !== "vehicle" || busy) return;
    if (liveRunning.current) {
      stopLive.current = true;
      setLive(false);
    }
    setBusy(true);
    setError(null);
    setServiceResult(null);
    try {
      setStatus("Определяю профиль SKEY блока…");
      const skey = await resolveSkeyForEcu(ecu);
      const confirmed = window.confirm(
        `${proc.nameRu}\n\nАвтомобиль: ${vehicle?.nameRu ?? "—"}\nБлок: ${ecu.nameRu} (${proc.txCanId}→${proc.rxCanId}, SKEY ${skey}, fid=${proc.fid})\n\nНазначение:\n${proc.descriptionRu}\n\nОбязательные условия:\n${proc.preconditionsRu}\n\nВыполнить процедуру?`,
      );
      if (!confirmed) {
        setStatus(null);
        return;
      }
      setStatus(`Выполняю «${proc.nameRu}»…`);
      const res = await session.runMitsubishiServiceProcedure({
        procedureId: proc.id,
        skey,
        txCanId: ecu.txCanId,
        rxCanId: ecu.rxCanId,
      });
      setServiceResult(res);
      setStatus(`Выполнено: ${proc.nameRu}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Сервисная процедура не выполнена");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const readTcmOnce = async () => {
    if (phase !== "vehicle" || busy) return;
    setBusy(true);
    setError(null);
    try {
      setTcm(await session.readMitsubishiTransmission());
    } catch (cause) {
      setTcm(null);
      setError(cause instanceof Error ? cause.message : "Нет ответа TCM 7E1");
    } finally {
      setBusy(false);
    }
  };

  const toggleTcmLive = async () => {
    if (tcmLiveRef.current) {
      tcmLiveRef.current = false;
      setTcmLive(false);
      return;
    }
    if (phase !== "vehicle" || busy) return;
    tcmLiveRef.current = true;
    setTcmLive(true);
    setError(null);
    try {
      while (tcmLiveRef.current) {
        setTcm(await session.readMitsubishiTransmission());
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Сбой live АКПП/CVT");
    } finally {
      tcmLiveRef.current = false;
      setTcmLive(false);
    }
  };

  const readMeterOnce = async () => {
    if (phase !== "vehicle" || busy) return;
    setBusy(true);
    setError(null);
    try {
      setMeter(await session.readMitsubishiMeter());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Нет ответа приборки 6A0");
    } finally {
      setBusy(false);
    }
  };

  const toggleSignal = (id: string) => {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_LIVE) return current;
      return [...current, id];
    });
  };

  const startLive = async () => {
    if (!selected || pickedSignals.length === 0 || liveRunning.current) return;
    liveRunning.current = true;
    stopLive.current = false;
    setLive(true);
    setError(null);
    liveMinMaxRef.current.clear();
    const tx = selected.txCanId;
    const rx = selected.rxCanId;
    try {
      try {
        await session.sendUds("6", tx, rx, "10 92", false);
      } catch {
        try {
          await session.sendUds("6", tx, rx, "10 03", false);
        } catch {
          /* some modules answer data requests without an explicit session */
        }
      }
      while (!stopLive.current) {
      const now: Record<string, string> = {};
      const numeric: Record<string, number | null> = {};
      const groups = new Map<string, CatalogSignal[]>();
      for (const signal of pickedSignals) {
        const key = `${signal.service.toString(16)}-${signal.localId.toString(16)}`;
        const bucket = groups.get(key) ?? [];
        bucket.push(signal);
        groups.set(key, bucket);
      }
      for (const group of groups.values()) {
        if (stopLive.current) break;
        const first = group[0]!;
        const request =
          first.service === 0x22
            ? `22 ${first.localId.toString(16).padStart(4, "0")}`
            : `21 ${first.localId.toString(16).padStart(2, "0")}`;
        try {
          const { parsed } = await session.sendUds("6", tx, rx, request, false);
          for (const signal of group) {
            const decoded = parsed.kind === "positive" ? decodeCatalogSignal(signal, parsed.payload) : null;
            now[signal.id] = decoded?.text ?? "—";
            numeric[signal.id] = decoded?.numeric ?? null;
          }
        } catch {
          for (const signal of group) {
            now[signal.id] = "—";
            numeric[signal.id] = null;
          }
        }
      }
      if (stopLive.current) break;
      for (const signal of pickedSignals) {
        const n = numeric[signal.id];
        if (n == null || Number.isNaN(n)) continue;
        const prev = liveMinMaxRef.current.get(signal.id);
        liveMinMaxRef.current.set(signal.id, {
          min: prev ? Math.min(prev.min, n) : n,
          max: prev ? Math.max(prev.max, n) : n,
        });
      }
      setLiveMinMaxTick((t) => t + 1);
      setLiveNow(now);
      setSamples((prev) => [...prev, { t: Date.now(), values: numeric }].slice(-MAX_POINTS));
      await new Promise((resolve) => setTimeout(resolve, 600));
      }
    } finally {
      liveRunning.current = false;
      setLive(false);
    }
  };

  const downloadCsv = () => {
    const columns = pickedSignals;
    const header = ["time", ...columns.map((signal) => signal.nameRu || signal.nameEn)].map(csvCell);
    const lines = [header.join(",")];
    for (const sample of samples) {
      const cells = [
        new Date(sample.t).toISOString(),
        ...columns.map((signal) => {
          const value = sample.values[signal.id];
          return value == null ? "" : String(value);
        }),
      ].map(csvCell);
      lines.push(cells.join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mut-live-${selected?.nameEn || "ecu"}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadVisit = () => {
    const pressures = pickedSignals
      .filter((signal) => /pressure|давлени/i.test(`${signal.nameEn} ${signal.nameRu}`))
      .map((signal) => ({
        label: signal.nameRu || signal.nameEn,
        value: liveNow[signal.id] ?? "",
      }));
    const csv = buildMitsubishiVisitReport({
      vin,
      vehicleName: vehicle ? vehicle.nameRu : null,
      modules: (vehicle?.ecus ?? []).map((ecu) => {
        const report = reports[addressKey(ecu.txCanId, ecu.rxCanId)];
        const master = texts[ecu.dtcMasterId] ?? {};
        return {
          nameRu: ecu.nameRu,
          address: `${ecu.txCanId}→${ecu.rxCanId}`,
          responded: report ? report.responded : null,
          partNumber: report?.partNumber ?? null,
          dtcs: (report?.dtcs ?? []).map((dtc) => ({
            code: dtc.code,
            textRu: master[dtc.code]?.ru || dtc.description,
            remedy: dtc.remedy ?? remedyForDtcCode(dtc.code),
            active: dtc.active,
          })),
        };
      }),
      transmission: tcm
        ? {
            kind: tcm.transmissionType,
            tempC: tcm.atfTempC,
            pipeC: tcm.atfTempPipeC,
            panC: tcm.atfTempPanC,
            formula: tcm.atfFormula === "a-55" ? "CVT A-55" : "8AT/5AT A-50",
            bandRu: tcm.atfTempC != null ? mitsubishiFluidBand(tcm.atfTempC, tcm.transmissionType).labelRu : null,
            selector: tcm.selectorPosition,
            gear: tcm.currentGearText,
            inputRpm: tcm.inputShaftRpm,
            outputRpm: tcm.outputShaftRpm,
            degradation: tcm.cvtDegradationCount,
          }
        : null,
      pressures,
      tpms: [],
      meter: meter ? { fuelLiters: meter.fuelLiters, odometerKm: meter.odometerKm } : null,
      live: pickedSignals.map((signal) => ({
        name: signal.nameRu || signal.nameEn,
        value: liveNow[signal.id] ?? "",
        unit: signal.unit,
      })),
    });
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `qhub-visit-${vin || vehicle?.vkey || "mitsubishi"}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const serviceButtons: Array<{ set: MitsubishiServiceSet; label: string }> = [
    { set: "engine", label: "Двигатель" },
    { set: "gearbox", label: "Коробка" },
    { set: "4wd", label: "4WD" },
    { set: "body", label: "Кузов" },
  ];

  const liveWorkspace =
    selected ? (
      <div
        id="mitsu-live-workspace"
        className="scroll-mt-3 space-y-2 rounded-xl border border-emerald-500/30 bg-white p-3"
      >
        <div className="sticky top-0 z-20 -mx-3 space-y-2 border-b border-gray-200 bg-white/95 px-3 pb-3 pt-0.5 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-emerald-700">Live · {selected.nameRu}</h3>
              <p className="font-mono text-[10px] text-gray-500">
                {selected.txCanId} → {selected.rxCanId}
              </p>
              {profileNote ? <p className="text-[10px] text-gray-500">{profileNote}</p> : null}
            </div>
            <button
              type="button"
              disabled={phase !== "vehicle" || busy || picked.length === 0}
              onClick={() => {
                if (live) {
                  stopLive.current = true;
                  setLive(false);
                  return;
                }
                void startLive();
              }}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40 ${
                live ? "bg-amber-600" : "bg-emerald-600"
              }`}
            >
              {live ? "Стоп" : `Старт (${picked.length})`}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-700"
              onClick={() => setPicked(pickPreferredMonitorSignals(signals, MAX_LIVE))}
            >
              Датчики MUT-III
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-700"
              onClick={() => setPicked(signals.slice(0, MAX_LIVE).map((s) => s.id))}
            >
              Первые {MAX_LIVE}
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-700"
              onClick={() => setPicked([])}
            >
              Сброс
            </button>
          </div>
        </div>

        {pickedSignals.length > 0 ? (
          <LiveMetricCards
            items={pickedSignals.map((signal) => {
              void liveMinMaxTick;
              const stats = liveMinMaxRef.current.get(signal.id);
              return {
                id: signal.id,
                label: signal.nameRu || signal.nameEn,
                value: liveNow[signal.id] ?? "—",
                unit: signal.unit,
                minText: stats ? String(stats.min) : null,
                maxText: stats ? String(stats.max) : null,
                highlight: live,
              };
            })}
          />
        ) : (
          <p className="text-xs text-gray-500">Отметьте параметры в «Настройка» ниже.</p>
        )}

        <details className="rounded-lg border border-gray-200 bg-gray-50 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-gray-700">
            Настройка параметров ({picked.length}/{MAX_LIVE})
          </summary>
          <input
            value={signalQuery}
            onChange={(event) => setSignalQuery(event.target.value)}
            placeholder="Поиск"
            className="mt-2 w-full min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-sm text-gray-900"
          />
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
            {visibleSignals.map((signal) => {
              const checked = picked.includes(signal.id);
              return (
                <li key={signal.id}>
                  <label className="flex items-center gap-2 text-xs text-gray-800">
                    <input type="checkbox" checked={checked} onChange={() => toggleSignal(signal.id)} />
                    <span className="min-w-0 flex-1 truncate">{signal.nameRu || signal.nameEn}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={samples.length === 0}
            onClick={downloadCsv}
            className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800 disabled:opacity-40"
          >
            CSV ({samples.length})
          </button>
        </details>

        {availableProcedures.length > 0 ? (
          <details open className="rounded-lg border border-amber-300/80 bg-amber-50/40 p-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-gray-900">
              Калибровки, сбросы адаптаций и тесты MUT-III SE ({availableProcedures.length}) · SKEY {selectedSkey}
            </summary>
            <p className="mt-1 text-[11px] leading-snug text-gray-600">
              Доступны только процедуры, официально привязанные в базе MUT-III SE к блоку «{selected.nameRu}» ({selected.txCanId}→{selected.rxCanId}, SKEY {selectedSkey}) выбранного автомобиля {vehicle?.nameRu}. Полный список по всем блокам — вкладка «Сервис и тесты».
            </p>
            <div className="mt-2 space-y-2">
              {availableProcedures.map((proc) => (
                <div
                  key={proc.id}
                  className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-2xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-gray-900">{proc.nameRu}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-gray-500">
                        MUT-III fid={proc.fid} · {proc.txCanId}→{proc.rxCanId} · Команда {proc.startRequest}
                        {proc.verifyReadRequest ? ` · Контроль ${proc.verifyReadRequest}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={phase !== "vehicle" || busy}
                      onClick={() => void runServiceProcedure(proc, selected)}
                      className="shrink-0 rounded-lg border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
                    >
                      Выполнить
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-gray-700">{proc.descriptionRu}</p>
                  <p className="mt-1 text-[10px] font-medium text-amber-900">
                    Условия: {proc.preconditionsRu}
                  </p>
                </div>
              ))}
            </div>
            {serviceResult ? (
              <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-950">
                <div className="font-semibold">
                  Результат: {serviceResult.nameRu} (SKEY {serviceResult.skey})
                </div>
                {serviceResult.decodedSummary ? (
                  <div className="mt-1 font-mono text-[11px] font-bold text-emerald-900">
                    {serviceResult.decodedSummary}
                  </div>
                ) : null}
                <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-gray-700">
                  {serviceResult.steps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </details>
        ) : null}

        <LiveChart signals={pickedSignals} samples={samples} />
      </div>
    ) : null;

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {vehicles.length > 0 ? (
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-gray-500">
            <span>{vinMatches.length > 1 && !vehicle ? "Модели по VIN" : "Машина"}</span>
            <select
              value={vehicle?.vkey ?? ""}
              onChange={(event) => {
                if (event.target.value) void chooseVehicle(event.target.value);
              }}
              className="w-full min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-sm text-gray-900"
            >
              <option value="">Выберите</option>
              {(vinMatches.length > 1 && !vehicle ? vinMatches : vehicles).map((item) => (
                <option key={item.vkey} value={item.vkey}>
                  {item.nameRu}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            vinAutoTried.current = true;
            vehiclePickedManually.current = false;
            void identify();
          }}
          className="rounded-lg border border-gray-900 bg-gray-900 hover:bg-gray-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          Определить по VIN
        </button>
      </div>
      {vin ? <p className="truncate font-mono text-[10px] text-gray-500">VIN {vin}</p> : null}
      {status ? <p className="text-xs text-emerald-800">{status}</p> : null}
      {error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-800">{error}</p>
      ) : null}
      {phase !== "vehicle" ? (
        <p className="text-xs text-gray-500">Подключите vLinker для опроса блоков.</p>
      ) : null}

      {section === "service" ? (
      <div className="rounded-xl border border-amber-300/80 bg-white p-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900">Сервис и тесты MUT-III SE</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
            {vehicle
              ? `Показаны только калибровки, сбросы адаптаций и тесты, которые база MUT-III SE привязала к блокам «${vehicle.nameRu}» по SKEY и CAN-адресу. Чужие команды для этой машины скрыты.`
              : "Подключите адаптер — VIN прочитается сам, и список процедур откроется для этой модели."}
          </p>
        </div>
        {vehicle && vehicleProcedures.length === 0 ? (
          <p className="mt-3 text-xs text-gray-500">
            Для выбранного автомобиля в текущем справочнике нет сервисных процедур. Калибровка угла руля и датчики TPMS — на соседних вкладках.
          </p>
        ) : null}
        {vehicleProcedures.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {vehicleProcedures.map(({ ecu, procedures }) => (
              <article key={ecu.sysKey} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-900">{ecu.nameRu}</h4>
                  <span className="font-mono text-[10px] text-gray-500">
                    {ecu.txCanId}→{ecu.rxCanId}
                  </span>
                </div>
                {ecu.skeys && ecu.skeys.length > 0 ? (
                  <p className="mt-0.5 font-mono text-[10px] text-gray-500">
                    SKEY {ecu.skeys.slice(0, 4).join(", ")}
                    {ecu.skeys.length > 4 ? ` · +${ecu.skeys.length - 4}` : ""}
                  </p>
                ) : null}
                <div className="mt-2 space-y-3">
                  {groupServiceProcedures(procedures).map((group) => (
                    <div key={group.id}>
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {group.label}
                      </div>
                      <div className="space-y-2">
                        {group.procedures.map((proc) => (
                          <ServiceProcedureCard
                            key={proc.id}
                            proc={proc}
                            disabled={phase !== "vehicle" || busy}
                            onRun={() => void runServiceProcedure(proc, ecu)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {serviceResult ? (
          <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-950">
            <div className="font-semibold">
              Результат: {serviceResult.nameRu} (SKEY {serviceResult.skey})
            </div>
            {serviceResult.decodedSummary ? (
              <div className="mt-1 font-mono text-[11px] font-bold text-emerald-900">
                {serviceResult.decodedSummary}
              </div>
            ) : null}
            <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-gray-700">
              {serviceResult.steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      ) : section === "live" ? (
      <>
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Топливо и пробег</h3>
            <p className="text-[11px] text-gray-500">Приборка 6A0 → 514, кадры 21 A3 и 21 AD.</p>
          </div>
          <button
            type="button"
            disabled={phase !== "vehicle" || busy}
            onClick={() => void readMeterOnce()}
            className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Считать
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Топливо в баке</div>
            <div className="mt-1 font-mono text-3xl font-bold text-gray-900">
              {meter?.fuelLiters != null ? meter.fuelLiters.toFixed(1) : "—"}
              <span className="ml-1 text-base font-semibold text-gray-500">л</span>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Пробег</div>
            <div className="mt-1 font-mono text-3xl font-bold text-gray-900">
              {meter?.odometerKm != null ? meter.odometerKm.toLocaleString("ru-RU") : "—"}
              <span className="ml-1 text-base font-semibold text-gray-500">км</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900">АКПП / CVT · температура масла</h3>
            <p className="text-[11px] text-gray-500">
              MUT-III SE: AT8 по картеру, 40–43 °C на 6B31 и 43–46 °C на 4N15. При 47 °C индикатор мигает, уровень не проверяют. CVT — при 70–80 °C, селектор P, холостой ход.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={phase !== "vehicle" || busy}
              onClick={() => void readTcmOnce()}
              className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Считать TCM 7E1
            </button>
            <button
              type="button"
              disabled={phase !== "vehicle" || busy}
              onClick={() => void toggleTcmLive()}
              className={`rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 ${
                tcmLive ? "bg-amber-600" : "border border-emerald-600 bg-emerald-600"
              }`}
            >
              {tcmLive ? "Стоп live" : "Live АКПП"}
            </button>
          </div>
        </div>
        {tcm ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 col-span-2 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                {tcm.transmissionType === "CVT" ? "Масло CVT" : "ATF (картер / труба)"}
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-800">
                {tcm.atfTempC != null ? `${tcm.atfTempC} °C` : "—"}
              </div>
              {tcm.atfTempC != null ? (
                <div className="mt-1 text-[11px] font-medium text-gray-800">
                  {mitsubishiFluidBand(tcm.atfTempC, tcm.transmissionType).labelRu}
                </div>
              ) : null}
              <div className="mt-1 font-mono text-[10px] text-gray-500">
                {tcm.atfFormula === "a-55" ? "MUT-III A−55" : "MUT-III A−50"}
                {tcm.atfTempPipeC != null ? ` · труба ${tcm.atfTempPipeC} °C` : ""}
                {tcm.atfTempPanC != null ? ` · картер ${tcm.atfTempPanC} °C` : ""}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Передача</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{tcm.currentGearText}</div>
              <div className="mt-1 text-[11px] text-gray-500">Селектор: {tcm.selectorPosition}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Валы / скорость</div>
              <div className="mt-1 text-xs text-gray-800">
                In {tcm.inputShaftRpm ?? "—"} · Out {tcm.outputShaftRpm ?? "—"} об/мин
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                {tcm.vehicleSpeedKmh != null ? `${tcm.vehicleSpeedKmh} км/ч` : "скорость —"}
                {tcm.cvtDegradationCount != null ? ` · деградация CVT ${tcm.cvtDegradationCount}` : ""}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Зажигание ON. На Pajero Sport III читается 8AT, на Outlander III — вариатор.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {vehicle?.ecus.find((ecu) => isTransmissionEcu(ecu.nameEn, ecu.nameRu)) ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const ecu = vehicle.ecus.find((item) => isTransmissionEcu(item.nameEn, item.nameRu));
                if (ecu) void openEcu(ecu);
              }}
              className="rounded-lg border border-emerald-700 px-3 py-1.5 text-[11px] text-emerald-800 disabled:opacity-40"
            >
              Data List АКПП из MUT-III
            </button>
          ) : null}
        </div>
      </div>

      {vehicle ? (
        <div className="flex flex-wrap gap-1.5">
          {serviceButtons.map((item) => {
            const ecu = vehicle.ecus.find((candidate) =>
              ecuMatchesServiceSet(candidate.nameEn, candidate.nameRu, item.set),
            );
            if (!ecu) return null;
            return (
              <button
                key={item.set}
                type="button"
                disabled={busy}
                onClick={() => void openEcu(ecu, item.set)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] text-gray-800 disabled:opacity-40"
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={downloadVisit}
            className="rounded-lg border border-gray-900 px-3 py-1.5 text-[11px] font-medium text-gray-900"
          >
            Отчёт визита
          </button>
        </div>
      ) : null}

      {liveWorkspace}
      </>
      ) : (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900">
              Блоки{vehicle ? ` · ${vehicle.ecus.length}` : ""}
            </h3>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
              {vehicle
                ? "«Считать ошибки» опрашивает все блоки. «Параметры» открывает показания блока на вкладке «Блоки и live»."
                : "Подключите адаптер, чтобы определить модель по VIN, или выберите машину вручную."}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || phase !== "vehicle" || !vehicle}
            onClick={() => void scan()}
            className="shrink-0 rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Считать ошибки
          </button>
        </div>
      {vehicle ? (
      <div className="mt-3 flex flex-col gap-2">
        {[...vehicle.ecus]
          .sort((a, b) => {
            const ra = reports[addressKey(a.txCanId, a.rxCanId)];
            const rb = reports[addressKey(b.txCanId, b.rxCanId)];
            const score = (r: ModuleDtcReport | undefined) => {
              if (!r) return 1;
              if (r.responded && r.dtcs.length > 0) return 0;
              if (r.responded) return 1;
              return 2;
            };
            return score(ra) - score(rb);
          })
          .map((ecu) => {
          const report = reports[addressKey(ecu.txCanId, ecu.rxCanId)];
          const master = texts[ecu.dtcMasterId] ?? {};
          const active = selectedKey === ecu.sysKey;
          return (
            <article
              key={ecu.sysKey}
              className={`rounded-xl border p-3 ${active ? "border-emerald-600 bg-white" : report && !report.responded ? "border-gray-200 bg-gray-50/60 opacity-75" : "border-gray-200 bg-gray-50"}`}
            >
              <div className="w-full text-left">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium text-gray-900">{ecu.nameRu}</h3>
                  <span className="font-mono text-[10px] text-gray-500">
                    {ecu.txCanId}→{ecu.rxCanId}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {report
                    ? report.responded
                      ? `${report.dtcs.length} ошибок${report.partNumber ? ` · ${report.partNumber}` : ""}`
                      : "не установлен в этой комплектации (нет ответа)"
                    : "ошибки ещё не считаны"}
                </p>
              </div>
              {report && report.dtcs.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-gray-700">
                  {report.dtcs.map((dtc) => (
                    <li key={dtc.code} className="rounded bg-gray-100 px-2 py-1.5">
                      <div>
                        <span className="font-mono text-amber-900">{dtc.code}</span>{" "}
                        {master[dtc.code]?.ru || dtc.description}
                        {dtc.active ? "" : " · в памяти"}
                      </div>
                      <div className="mt-0.5 text-[10px] leading-snug text-gray-500">
                        {dtc.remedy ?? remedyForDtcCode(dtc.code)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  disabled={busy || phase !== "vehicle"}
                  onClick={() => void scanSingleEcu(ecu)}
                  className="rounded border border-gray-300 bg-white px-2 py-1 font-medium text-gray-800 disabled:opacity-40"
                >
                  Считать
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void openEcu(ecu);
                    onShowLive?.();
                  }}
                  className="rounded border border-gray-900 px-2 py-1 font-medium text-gray-900 disabled:opacity-40"
                >
                  Параметры
                </button>
                {ecu.canSafeClear && (report?.responded || (report?.dtcs.length ?? 0) > 0) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void clearEcu(ecu)}
                    className="rounded border border-red-300 bg-red-50 px-2 py-1 font-medium text-red-900 hover:bg-red-100 disabled:opacity-40"
                  >
                    Стереть ошибки
                  </button>
                ) : null}
                {ecu.coding ? (
                  <Link
                    href={`/tools/etacs-coding?scenario=${ecu.coding === "engine" ? "engine_kon" : "etacs_kon"}`}
                    className="rounded border border-emerald-800 px-2 py-1 text-emerald-800"
                  >
                    Кодирование
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
        {vehicle.ecus.length === 0 ? (
          <p className="text-xs text-gray-500">В каталоге этой машины нет блоков.</p>
        ) : null}
      </div>
      ) : null}
      </div>
      )}
    </section>
  );
}

function groupServiceProcedures(procedures: MitsubishiServiceProcedure[]) {
  const groups = new Map<MitsubishiServicePackageId, MitsubishiServiceProcedure[]>();
  for (const proc of procedures) {
    const list = groups.get(proc.packageId) ?? [];
    list.push(proc);
    groups.set(proc.packageId, list);
  }
  return PACKAGE_ORDER.filter((id) => groups.has(id)).map((id) => ({
    id,
    label: PACKAGE_LABEL[id],
    procedures: groups.get(id)!,
  }));
}

function ServiceProcedureCard({
  proc,
  disabled,
  onRun,
}: {
  proc: MitsubishiServiceProcedure;
  disabled: boolean;
  onRun: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-gray-900">{proc.nameRu}</div>
          <div className="mt-0.5 font-mono text-[10px] text-gray-500">
            MUT-III fid={proc.fid} · {proc.txCanId}→{proc.rxCanId} · Команда {proc.startRequest}
            {proc.verifyReadRequest ? ` · Контроль ${proc.verifyReadRequest}` : ""}
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onRun}
          className="shrink-0 rounded-lg border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
        >
          Выполнить
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-gray-700">{proc.descriptionRu}</p>
      <p className="mt-1 text-[10px] font-medium text-amber-900">Условия: {proc.preconditionsRu}</p>
    </div>
  );
}

function LiveChart({ signals, samples }: { signals: CatalogSignal[]; samples: Sample[] }) {
  if (signals.length === 0 || samples.length < 2) return null;
  const width = 320;
  const height = 96;
  const colors = ["#34d399", "#38bdf8", "#fbbf24", "#f472b6"];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-24 w-full" role="img" aria-label="График параметров">
      {signals.map((signal, index) => {
        const series = samples.map((sample) => sample.values[signal.id]).filter((value): value is number => value != null);
        if (series.length < 2) return null;
        const min = Math.min(...series);
        const max = Math.max(...series);
        const span = max - min || 1;
        const points = samples
          .map((sample, sampleIndex) => {
            const value = sample.values[signal.id];
            if (value == null) return null;
            const x = (sampleIndex / (samples.length - 1)) * width;
            const y = height - ((value - min) / span) * (height - 8) - 4;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .filter((point): point is string => point != null)
          .join(" ");
        return (
          <polyline
            key={signal.id}
            fill="none"
            stroke={colors[index % colors.length]}
            strokeWidth="1.5"
            points={points}
          />
        );
      })}
    </svg>
  );
}
