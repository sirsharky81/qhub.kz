"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatBleFailure } from "@/lib/obd/ble-error";
import {
  downloadMitsubishiEtacsCoding,
  listMitsubishiEtacsProfiles,
  uploadMitsubishiEtacsSingleBlock,
} from "@/lib/obd/mitsubishi-etacs-download";
import {
  parseMitsubishiCodingFileBytes,
  type EtacsCodingDump,
  type EtacsWriteBlockResult,
} from "@/lib/obd/mitsubishi-etacs";
import { ObdBleSession, type ObdConnectionPhase } from "@/lib/obd/obd-session";
import { useObdTransportKind } from "@/lib/obd/use-obd-transport";
import { saveEtacsDumpBackup, saveOriginalFileBackup } from "./etacs-backup";

type UploadStep =
  | "idle"
  | "connecting"
  | "reading"
  | "writing_kon"
  | "writing_cuf"
  | "done"
  | "error";

export interface SlotBackupInfo {
  displayName: string;
  originalBytes: Uint8Array | null;
  backupSavedAt: string | null;
  hasFile: boolean;
  loadSource?: "disk" | "obd" | null;
}

export type ObdTargetScenario = "etacs_kon" | "etacs_cuf" | "engine_kon";

interface Props {
  slotA: SlotBackupInfo;
  slotB: SlotBackupInfo;
  embedded?: boolean;
  panelMode?: "full" | "readOnly" | "writeOnly";
  targetScenario?: ObdTargetScenario;
  uploadAllowed?: boolean;
  /** Текущие байты файла A (после правок) для записи .kon/.cuf */
  getCurrentBytesA: () => Promise<Uint8Array>;
  getCurrentBytesB: () => Promise<Uint8Array | null>;
  onBackupSavedA: (iso: string) => void;
  onBackupSavedB: (iso: string) => void;
  onObdDumpRead?: (dump: EtacsCodingDump) => void | Promise<void>;
  onOpenFileA?: () => void;
  onOpenFileB?: () => void;
  /** .cuf сохранённый при выгрузке с блока или выбранный с диска (чтобы слот B оставался под сравнение .kon) */
  cufFallbackBytes?: Uint8Array | null;
  cufFallbackName?: string;
  onPickCompanionCuf?: (bytes: Uint8Array, name: string) => void;
}

const phaseLabels: Record<ObdConnectionPhase, string> = {
  idle: "BLE не подключён",
  adapter: "Адаптер OK, ждём ЭБУ",
  vehicle: "ЭБУ на связи",
};

export default function EtacsBlockUploadPanel({
  slotA,
  slotB,
  embedded = false,
  panelMode = "full",
  targetScenario = "etacs_kon",
  uploadAllowed = true,
  getCurrentBytesA,
  getCurrentBytesB,
  onBackupSavedA,
  onBackupSavedB,
  onObdDumpRead,
  onOpenFileA,
  onOpenFileB,
  cufFallbackBytes,
  cufFallbackName,
  onPickCompanionCuf,
}: Props) {
  const [session] = useState(() => new ObdBleSession());
  const sessionRef = useRef(session);
  const { transport, ready: transportReady } = useObdTransportKind();

  const [phase, setPhase] = useState<ObdConnectionPhase>("idle");
  const [adapterLabel, setAdapterLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<UploadStep>("idle");
  const [statusLine, setStatusLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const allProfiles = listMitsubishiEtacsProfiles();
  const profiles = allProfiles.filter((p) =>
    targetScenario === "engine_kon" ? p.moduleKind === "engine" : p.moduleKind !== "engine",
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const profileId =
    selectedProfileId && profiles.some((p) => p.id === selectedProfileId)
      ? selectedProfileId
      : targetScenario === "engine_kon"
        ? "engine-auto"
        : "auto";
  const companionCufInputRef = useRef<HTMLInputElement>(null);
  const [lastDump, setLastDump] = useState<EtacsCodingDump | null>(null);
  const [konResult, setKonResult] = useState<EtacsWriteBlockResult | null>(null);
  const [cufResult, setCufResult] = useState<EtacsWriteBlockResult | null>(null);
  const [localBackupAAt, setLocalBackupAAt] = useState<string | null>(null);
  const [localBackupBAt, setLocalBackupBAt] = useState<string | null>(null);
  const backupAAt = slotA.backupSavedAt ?? localBackupAAt;
  const backupBAt = slotB.backupSavedAt ?? localBackupBAt;

  useEffect(() => {
    const currentSession = sessionRef.current;
    currentSession.setLinkLostHandler(() => {
      setPhase("idle");
      setAdapterLabel(null);
      setStep("error");
      setError("Связь с адаптером прервалась. Подключите vLinker снова.");
    });
    return () => currentSession.setLinkLostHandler(null);
  }, []);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-40), line]);
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      setStatusLine(label);
      try {
        await fn();
      } catch (e) {
        setStep("error");
        setError(formatBleFailure(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const connectBle = () =>
    run("Подключение vLinker…", async () => {
      setStep("connecting");
      const { name } = await sessionRef.current.connectAdapter();
      setAdapterLabel(name);
      const state = await sessionRef.current.linkVehicle();
      setPhase(sessionRef.current.phase);
      if (state) {
        const versionInfo = state.elm?.versionLine || "CAN 11-bit 500k";
        pushLog(`Связь с ЭБУ установлена (${versionInfo})`);
      }
      setStep("idle");
      setStatusLine("Готово к считыванию или записи");
    });

  const disconnectBle = () =>
    run("Отключение…", async () => {
      await sessionRef.current.disconnect();
      setPhase("idle");
      setAdapterLabel(null);
      setStatusLine("");
    });

  const saveOriginalA = () =>
    run("Резервная копия файла A…", async () => {
      if (!slotA.originalBytes?.length) {
        throw new Error("Сначала откройте файл A");
      }
      const name = await saveOriginalFileBackup(slotA.originalBytes, slotA.displayName || "file-a.kon");
      const at = new Date().toISOString();
      setLocalBackupAAt(at);
      onBackupSavedA(at);
      pushLog(`Сохранён исходник A: ${name}`);
      setStatusLine(`Исходник A сохранён: ${name}`);
    });

  const saveOriginalB = () =>
    run("Резервная копия файла B…", async () => {
      if (!slotB.originalBytes?.length) {
        throw new Error("Сначала откройте файл B");
      }
      const name = await saveOriginalFileBackup(slotB.originalBytes, slotB.displayName || "file-b.kon");
      const at = new Date().toISOString();
      setLocalBackupBAt(at);
      onBackupSavedB(at);
      pushLog(`Сохранён исходник B: ${name}`);
      setStatusLine(`Исходник B сохранён: ${name}`);
    });

  const readFromBlock = () =>
    run("Считывание ETACS с блока…", async () => {
      if (phase !== "vehicle") throw new Error("Сначала подключите vLinker и дождитесь связи с ЭБУ");
      setStep("reading");
      const dump = await downloadMitsubishiEtacsCoding(sessionRef.current, profileId);
      setLastDump(dump);
      setSelectedProfileId(dump.profileId);
      pushLog(
        `Считано: ${dump.partNumber ?? "?"} · .kon ${dump.variant.length} Б · .cuf ${dump.custom.length} Б`,
      );
      if (onObdDumpRead) {
        await onObdDumpRead(dump);
        setStep("done");
        setStatusLine(
          targetScenario === "etacs_cuf"
            ? "Считан Custom Coding (.cuf). Сохраните исходник .cuf ниже, чтобы открыть его в слоте A."
            : targetScenario === "engine_kon"
              ? "Считана кодировка ЭБУ двигателя (.kon). Сохраните исходник .kon ниже, чтобы открыть его в слоте A."
              : "Считаны оба блока ETACS (.kon и .cuf). Сохраните оба исходника ниже перед редактированием.",
        );
      } else {
        setStep("reading");
        setStatusLine("Сохранение резервной копии с блока…");
        const saved = await saveEtacsDumpBackup(dump);
        pushLog(`Резерв с блока: ${saved.kon}${saved.cuf ? `, ${saved.cuf}` : ""}, ${saved.json}`);
        setStep("done");
        setStatusLine(`С блока считано и сохранено: ${saved.kon} (+ JSON).`);
      }
    });

  const ensureBackupOrConfirm = (side: "A" | "B", savedAt: string | null): boolean => {
    if (savedAt) return true;
    return window.confirm(
      `Резервная копия файла ${side} (исходник с диска) ещё не сохранена.\n\nРекомендуется «Сохранить исходник ${side}» перед записью в блок.\n\nПродолжить запись без резервной копии?`,
    );
  };

  const fileKind = (name: string): "kon" | "cuf" =>
    /\.cuf$/i.test(name) ? "cuf" : "kon";

  const writeKonToBlock = () => {
    if (!uploadAllowed) {
      setError("Сначала сохраните правки в файлах и исходники (если выгружали с блока).");
      return;
    }
    const isEngine = targetScenario === "engine_kon";
    if (
      !window.confirm(
        isEngine
          ? "Записать Variant Coding (.kon) в ЭБУ двигателя (ECM)?"
          : "Записать Variant Coding (.kon) в блок ETACS?\n\nПосле записи .kon настройки Custom Coding (.cuf) в блоке будут сброшены — обязательно выполните шаг 2 и запишите .cuf, чтобы восстановить настройки.",
      )
    ) {
      return;
    }
    void run("Запись .kon в блок…", async () => {
      if (phase !== "vehicle") throw new Error("Нет связи с ЭБУ");
      if (!ensureBackupOrConfirm("A", backupAAt)) return;
      setStep("writing_kon");
      const bytes = await getCurrentBytesA();
      const kind = fileKind(slotA.displayName);
      if (kind !== "kon") {
        throw new Error("Файл A должен быть .kon для шага 1 (Variant Coding)");
      }
      const parsed = parseMitsubishiCodingFileBytes(bytes, "kon", slotA.displayName);
      const targetProfile = lastDump?.profileId ?? profileId;
      const res = await uploadMitsubishiEtacsSingleBlock(sessionRef.current, {
        profileId: targetProfile,
        kind: "kon",
        payload: parsed.payload,
        overrideLidHex: lastDump?.variantUsedId ?? parsed.detectedLidHex ?? undefined,
      });
      setKonResult(res);
      setStep("done");
      pushLog(
        `.kon записан ${res.txHex}→${res.rxHex} (${res.writtenBytes} Б) ${res.verified ? "[OK]" : ""}`,
      );
      setStatusLine(res.note || "Запись .kon завершена");
    });
  };

  const writeCufToBlock = () => {
    if (!uploadAllowed) {
      setError("Сначала сохраните правки в файлах и исходники (если выгружали с блока).");
      return;
    }
    const isStandaloneCuf = targetScenario === "etacs_cuf";
    if (
      !window.confirm(
        isStandaloneCuf
          ? "Записать изменённый Custom Coding (.cuf) из слота A в блок ETACS?"
          : "Записать Custom Coding (.cuf) в блок ETACS для восстановления настроек после .kon?",
      )
    ) {
      return;
    }
    void run("Запись .cuf в блок…", async () => {
      if (phase !== "vehicle") throw new Error("Нет связи с ЭБУ");
      const cufBytesFromB = slotB.displayName && /\.cuf$/i.test(slotB.displayName)
        ? await getCurrentBytesB()
        : null;
      const bytes =
        cufBytesFromB ??
        (/\.cuf$/i.test(slotA.displayName) ? await getCurrentBytesA() : null) ??
        cufFallbackBytes ??
        null;
      if (!bytes) {
        throw new Error(
          "Нет данных .cuf: откройте .cuf в слоте A/B или сначала выгрузите кодировку с блока ETACS.",
        );
      }
      const name = cufBytesFromB
        ? slotB.displayName
        : /\.cuf$/i.test(slotA.displayName)
          ? slotA.displayName
          : cufFallbackName || "custom.cuf";
      if (
        cufBytesFromB &&
        !ensureBackupOrConfirm("B", backupBAt)
      ) {
        return;
      }
      setStep("writing_cuf");
      const parsed = parseMitsubishiCodingFileBytes(bytes, "cuf", name);
      const targetProfile = lastDump?.profileId ?? profileId;
      const res = await uploadMitsubishiEtacsSingleBlock(sessionRef.current, {
        profileId: targetProfile,
        kind: "cuf",
        payload: parsed.payload,
        overrideLidHex: lastDump?.customUsedId ?? parsed.detectedLidHex ?? undefined,
      });
      setCufResult(res);
      setStep("done");
      pushLog(
        `.cuf записан ${res.txHex}→${res.rxHex} (${res.writtenBytes} Б) ${res.verified ? "[OK]" : ""}`,
      );
      setStatusLine(res.note || "Запись .cuf завершена");
    });
  };

  const stepLabel: Record<UploadStep, string> = {
    idle: "",
    connecting: "Подключение BLE…",
    reading: "Считывание с блока…",
    writing_kon: "Запись .kon…",
    writing_cuf: "Запись .cuf…",
    done: "Готово",
    error: "Ошибка",
  };

  const showStatusBar =
    step !== "idle" || phase !== "idle" || Boolean(statusLine) || Boolean(error);

  const btnPrimary =
    "w-full rounded-lg border border-gray-900 bg-gray-900 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-gray-800 disabled:opacity-40";
  const btnSecondary =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-medium text-gray-800 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40";
  const btnWarn =
    "w-full rounded-lg border border-amber-600 bg-amber-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-40";
  const sectionTitle = "text-[11px] font-semibold uppercase tracking-wider text-gray-400";
  const sectionBox = "rounded-xl border border-gray-200 bg-white p-3 shadow-sm";

  const writeDisabled = busy || phase !== "vehicle" || !uploadAllowed;
  const showReadBtn = panelMode !== "writeOnly";
  const showWriteSection = panelMode !== "readOnly";

  return (
    <div className={`flex flex-col gap-3 ${embedded ? "" : "mt-4 pb-4"}`}>
      {showStatusBar ? (
        <div
          className={[
            "rounded-xl border px-3 py-2.5 text-xs leading-relaxed",
            step === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : step === "done"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-blue-100 bg-blue-50 text-gray-700",
          ].join(" ")}
        >
          {step !== "idle" ? <div className="font-semibold text-gray-900">{stepLabel[step]}</div> : null}
          {statusLine ? <div className="mt-0.5 break-words">{statusLine}</div> : null}
          {phase !== "idle" ? (
            <div className="mt-1 font-mono text-[10px] text-gray-500">
              {phaseLabels[phase]} · {transportReady ? transport : "…"}
              {adapterLabel ? ` · ${adapterLabel}` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      <div className={sectionBox}>
        <p className={sectionTitle}>
          {panelMode === "writeOnly" ? "Подключение адаптера (OBD)" : "Считывание с блока (OBD)"}
        </p>
        {embedded ? (
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {targetScenario === "etacs_cuf"
              ? "Зажигание ON, двигатель заглушен. Будет считан Custom Coding (.cuf) и загружен в слот A."
              : targetScenario === "engine_kon"
                ? "Зажигание ON, двигатель заглушен. Будет считана кодировка ЭБУ двигателя (.kon) и загружена в слот A."
                : "Зажигание ON, двигатель заглушен. Будут считаны оба файла ETACS (.kon и .cuf): после сохранения обоих исходников в слот A откроется .kon для редактирования, а .cuf сохранится для восстановления настроек после заливки .kon."}
          </p>
        ) : null}
        <label className="mt-2 block text-xs text-gray-500">
          Профиль CAN
          <select
            className="mt-1 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-900"
            value={profileId}
            disabled={busy}
            onChange={(e) => setSelectedProfileId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 flex flex-col gap-2">
          {phase === "vehicle" ? (
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => void disconnectBle()}>
              Отключить BLE
            </button>
          ) : (
            <button type="button" className={btnPrimary} disabled={busy || !transportReady} onClick={() => void connectBle()}>
              Подключить vLinker
            </button>
          )}
          {showReadBtn ? (
            <button
              type="button"
              className={btnSecondary}
              disabled={busy || phase !== "vehicle"}
              onClick={() => void readFromBlock()}
            >
              {embedded ? "Считать с блока" : "Считать с блока и сохранить резерв"}
            </button>
          ) : null}
        </div>
      </div>

      {!embedded && (onOpenFileA || onOpenFileB) ? (
        <div className={sectionBox}>
          <p className={sectionTitle}>Файлы для записи</p>
          <div className="mt-2 flex flex-col gap-2">
            {onOpenFileA ? (
              <button type="button" className={btnSecondary} disabled={busy} onClick={onOpenFileA}>
                <span className="block truncate text-left">
                  {slotA.hasFile ? `A · ${slotA.displayName}` : "Открыть .kon (слот A)"}
                </span>
              </button>
            ) : null}
            {onOpenFileB ? (
              <button type="button" className={btnSecondary} disabled={busy} onClick={onOpenFileB}>
                <span className="block truncate text-left">
                  {slotB.hasFile ? `B · ${slotB.displayName}` : "Открыть .cuf (слот B)"}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!embedded ? (
        <div className={sectionBox}>
          <p className={sectionTitle}>Резервные копии</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Сохраните исходные файлы с диска до записи в блок.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <button type="button" className={btnSecondary} disabled={!slotA.originalBytes || busy} onClick={() => void saveOriginalA()}>
              Сохранить исходник A
            </button>
            {backupAAt ? (
              <p className="text-[10px] text-emerald-600">A · {new Date(backupAAt).toLocaleString("ru")}</p>
            ) : null}
            <button type="button" className={btnSecondary} disabled={!slotB.originalBytes || busy} onClick={() => void saveOriginalB()}>
              Сохранить исходник B
            </button>
            {backupBAt ? (
              <p className="text-[10px] text-emerald-600">B · {new Date(backupBAt).toLocaleString("ru")}</p>
            ) : null}
          </div>
          {lastDump ? (
            <p className="mt-2 break-words font-mono text-[10px] leading-relaxed text-gray-500">
              Считано: {lastDump.partNumber ?? "?"} · {lastDump.txHex}→{lastDump.rxHex} · kon {lastDump.variant.length} B
              {lastDump.custom.length > 0 ? ` · cuf ${lastDump.custom.length} B` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {embedded && !uploadAllowed ? (
        <p className="text-xs leading-relaxed text-gray-500">
          Запись в блок станет доступна после сохранения исходников (если считывали с ETACS) и сохранения всех правок в файлах.
        </p>
      ) : null}

      {showWriteSection ? (
      <div className={`${sectionBox} border-amber-200 bg-amber-50/50`}>
        <p className={sectionTitle}>
          {targetScenario === "engine_kon"
            ? "Запись в ЭБУ двигателя (ECM)"
            : targetScenario === "etacs_cuf"
              ? "Запись Custom Coding (.cuf) в ETACS"
              : "Двухшаговая запись в ETACS (.kon → .cuf)"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
          {targetScenario === "engine_kon"
            ? "Записывается только файл .kon двигателя из слота A (1 шаг)."
            : targetScenario === "etacs_cuf"
              ? "Записывается только изменённый .cuf из слота A (1 шаг). Таблица Variant (.kon) при этом не затрагивается."
              : "Шаг 1 — запись изменённого .kon из слота A. После записи .kon блок ETACS сбрасывает настройки .cuf! Шаг 2 — обязательная запись файла .cuf для восстановления настроек."}
        </p>

        {targetScenario === "etacs_kon" ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-white p-2 text-xs text-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Файл <code>.cuf</code> для шага 2:{" "}
                <strong className="font-mono text-gray-900">
                  {cufFallbackName || (slotB.displayName && /\.cuf$/i.test(slotB.displayName) ? slotB.displayName : "не выбран")}
                </strong>
              </span>
              {onPickCompanionCuf ? (
                <>
                  <button
                    type="button"
                    className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-800 hover:bg-gray-100"
                    onClick={() => companionCufInputRef.current?.click()}
                  >
                    Выбрать .cuf с диска…
                  </button>
                  <input
                    ref={companionCufInputRef}
                    type="file"
                    hidden
                    accept=".cuf"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      const buf = new Uint8Array(await f.arrayBuffer());
                      onPickCompanionCuf(buf, f.name);
                    }}
                  />
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          {targetScenario === "etacs_cuf" ? (
            <button
              type="button"
              className={btnWarn}
              disabled={writeDisabled || !slotA.hasFile}
              onClick={writeCufToBlock}
            >
              Записать .cuf из слота A в ETACS
            </button>
          ) : targetScenario === "engine_kon" ? (
            <button
              type="button"
              className={btnWarn}
              disabled={writeDisabled || !slotA.hasFile}
              onClick={writeKonToBlock}
            >
              Записать .kon из слота A в ЭБУ двигателя
            </button>
          ) : (
            <>
              <button
                type="button"
                className={btnWarn}
                disabled={writeDisabled || !slotA.hasFile}
                onClick={writeKonToBlock}
              >
                Шаг 1. Записать .kon из слота A
              </button>
              <button
                type="button"
                className={konResult ? btnWarn : btnSecondary}
                disabled={writeDisabled || (!cufFallbackBytes && !(slotB.displayName && /\.cuf$/i.test(slotB.displayName)))}
                onClick={writeCufToBlock}
              >
                Шаг 2. Записать .cuf (восстановить настройки после .kon)
              </button>
            </>
          )}
        </div>
        {konResult ? (
          <p className="mt-2 break-words rounded-lg border border-amber-300 bg-amber-100 p-2 text-[11px] leading-relaxed text-amber-950">
            .kon записан ({konResult.txHex}→{konResult.rxHex}).{" "}
            {targetScenario === "etacs_kon" ? (
              <strong>Теперь обязательно нажмите «Шаг 2. Записать .cuf», иначе настройки Custom Coding в блоке останутся сброшенными!</strong>
            ) : (
              <span>{konResult.note}</span>
            )}
          </p>
        ) : null}
        {cufResult ? (
          <p className="mt-2 break-words rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] leading-relaxed text-emerald-900">
            .cuf {cufResult.txHex}→{cufResult.rxHex} · {cufResult.verified ? "проверено" : "принято"} — {cufResult.note}
          </p>
        ) : null}
      </div>
      ) : null}

      {log.length > 0 ? (
        <pre className="max-h-28 overflow-auto rounded-xl border border-gray-200 bg-gray-100 p-2 font-mono text-[10px] leading-relaxed text-gray-600">
          {log.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}
