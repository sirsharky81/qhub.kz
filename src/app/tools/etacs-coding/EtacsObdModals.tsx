"use client";

import { useState } from "react";
import {
  etacsDownloadNames,
  formatMutCodingContainer,
  type EtacsCodingDump,
} from "@/lib/obd/mitsubishi-etacs";
import { saveBlobToDevice } from "@/lib/platform/save-file";
import { PickerButton } from "../random-picker/components/PickerButton";
import EtacsBlockUploadPanel, {
  type ObdTargetScenario,
  type SlotBackupInfo,
} from "./EtacsBlockUploadPanel";

interface ReadModalProps {
  open: boolean;
  onClose: () => void;
  slotA: SlotBackupInfo;
  slotB: SlotBackupInfo;
  getCurrentBytesA: () => Promise<Uint8Array>;
  getCurrentBytesB: () => Promise<Uint8Array | null>;
  onBackupSavedA: (iso: string) => void;
  onBackupSavedB: (iso: string) => void;
  /** После сохранения исходников — загрузить выбранный файл (.kon или .cuf) в слот A и закрыть окно */
  onCompleteToEditor: (
    dump: EtacsCodingDump,
    scenario: ObdTargetScenario,
  ) => Promise<void>;
}

const SCENARIO_OPTIONS: {
  id: ObdTargetScenario;
  title: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: "etacs_kon",
    title: "ETACS — Variant Coding (.kon)",
    badge: "Выгрузит .kon + .cuf",
    desc: "Для редактирования опций автомобиля в .kon. Обязательно выгружаются оба файла (.kon и .cuf), так как после записи изменённого .kon настройки .cuf сбрасываются и их нужно залить вторым шагом.",
  },
  {
    id: "etacs_cuf",
    title: "ETACS — только Custom Coding (.cuf)",
    badge: "Только .cuf → в слот A",
    desc: "Для редактирования только кастомных настроек (.cuf). Выгружается, сохраняется и открывается в слоте A только файл .cuf (и записывается обратно в 1 шаг без сброса .kon).",
  },
  {
    id: "engine_kon",
    title: "ЭБУ Двигателя (ECM) — Variant (.kon)",
    badge: "Только .kon ДВС → в слот A",
    desc: "Выгрузка кодировки двигателя (7E0→7E8). Сохраняется исходник .kon и открывается в слоте A для редактирования и записи.",
  },
];

export function EtacsObdReadModal({
  open,
  onClose,
  slotA,
  slotB,
  getCurrentBytesA,
  getCurrentBytesB,
  onBackupSavedA,
  onBackupSavedB,
  onCompleteToEditor,
}: ReadModalProps) {
  const [scenario, setScenario] = useState<ObdTargetScenario>("etacs_kon");
  const [dump, setDump] = useState<EtacsCodingDump | null>(null);
  const [konSaved, setKonSaved] = useState(false);
  const [cufSaved, setCufSaved] = useState(false);
  const [busySave, setBusySave] = useState(false);

  if (!open) return null;

  const hasCufInDump = Boolean(dump && dump.custom.length > 0);
  const requiresKonBackup = scenario === "etacs_kon" || scenario === "engine_kon";
  const requiresCufBackup =
    scenario === "etacs_cuf" || (scenario === "etacs_kon" && hasCufInDump);

  const canEnterEditor = Boolean(
    dump &&
      (!requiresKonBackup || konSaved) &&
      (!requiresCufBackup || cufSaved),
  );

  const saveDumpKon = async () => {
    if (!dump) return;
    setBusySave(true);
    try {
      const part = dump.partNumber ?? (scenario === "engine_kon" ? "1860D362" : "8637C671");
      const vin = dump.vin ?? "UNKNOWNVIN0000000";
      const now = new Date();
      const names = etacsDownloadNames(`${part}_${vin}_orig`, { partNumber: part, vin });
      const bytes = formatMutCodingContainer({
        payload: dump.variant,
        partNumber: part,
        vin,
        timestamp: now,
      });
      await saveBlobToDevice(new Blob([Uint8Array.from(bytes)]), names.kon);
      setKonSaved(true);
    } finally {
      setBusySave(false);
    }
  };

  const saveDumpCuf = async () => {
    if (!dump || dump.custom.length === 0) return;
    setBusySave(true);
    try {
      const part = dump.partNumber ?? "8637C671";
      const vin = dump.vin ?? "UNKNOWNVIN0000000";
      const now = new Date();
      const names = etacsDownloadNames(`${part}_${vin}_orig`, { partNumber: part, vin });
      const bytes = formatMutCodingContainer({
        payload: dump.custom,
        partNumber: part,
        vin,
        timestamp: now,
      });
      await saveBlobToDevice(new Blob([Uint8Array.from(bytes)]), names.cuf);
      setCufSaved(true);
    } finally {
      setBusySave(false);
    }
  };

  const saveBoth = async () => {
    await saveDumpKon();
    if (hasCufInDump) await saveDumpCuf();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Выгрузить кодировку с блока (OBD)</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Выберите, что именно вы хотите выгрузить и редактировать в слоте A. Слот B всегда остаётся свободным для сравнения однотипных файлов.
            </p>
          </div>
          <PickerButton variant="ghost" onClick={onClose} ariaLabel="Закрыть">
            ✕
          </PickerButton>
        </div>

        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            1. Что выгружаем и редактируем
          </p>
          <div className="grid grid-cols-1 gap-2">
            {SCENARIO_OPTIONS.map((opt) => {
              const active = scenario === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setScenario(opt.id);
                    setDump(null);
                    setKonSaved(false);
                    setCufSaved(false);
                  }}
                  className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                    active
                      ? "border-gray-900 bg-gray-50 ring-1 ring-gray-900"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-900">{opt.title}</span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      {opt.badge}
                    </span>
                  </div>
                  <span className="mt-1 text-[11px] leading-snug text-gray-500">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3">
          <EtacsBlockUploadPanel
            embedded
            panelMode="readOnly"
            targetScenario={scenario}
            slotA={slotA}
            slotB={slotB}
            getCurrentBytesA={getCurrentBytesA}
            getCurrentBytesB={getCurrentBytesB}
            onBackupSavedA={onBackupSavedA}
            onBackupSavedB={onBackupSavedB}
            onObdDumpRead={(d) => {
              setDump(d);
              setKonSaved(false);
              setCufSaved(false);
            }}
          />
        </div>

        {dump ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-semibold">
              Прежде чем начать редактировать, сохраните выгруженные исходники
            </p>
            <p className="mt-1 leading-relaxed">
              {scenario === "etacs_cuf"
                ? "Сохраните исходный файл .cuf на устройство. После сохранения он откроется в слоте A для редактирования."
                : scenario === "engine_kon"
                  ? "Сохраните исходный файл .kon ЭБУ двигателя на устройство. После сохранения он откроется в слоте A."
                  : hasCufInDump
                    ? "Для редактирования ETACS .kon необходимо сохранить оба исходных файла: .kon (Variant) и .cuf (Custom, потребуется для восстановления настроек после заливки .kon)."
                    : "Сохраните считанный исходник .kon на устройство перед переходом к редактированию."}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {requiresKonBackup ? (
                <PickerButton
                  variant={konSaved ? "secondary" : "primary"}
                  disabled={busySave}
                  onClick={() => void saveDumpKon()}
                >
                  {konSaved ? "✓ Исходник .kon сохранён" : "Сохранить исходник .kon"}
                </PickerButton>
              ) : null}
              {requiresCufBackup ? (
                <PickerButton
                  variant={cufSaved ? "secondary" : "primary"}
                  disabled={busySave || !hasCufInDump}
                  onClick={() => void saveDumpCuf()}
                >
                  {cufSaved ? "✓ Исходник .cuf сохранён" : "Сохранить исходник .cuf"}
                </PickerButton>
              ) : null}
              {requiresKonBackup && requiresCufBackup && (!konSaved || !cufSaved) ? (
                <PickerButton variant="secondary" disabled={busySave} onClick={() => void saveBoth()}>
                  Сохранить оба файла (.kon и .cuf)
                </PickerButton>
              ) : null}
            </div>
            <div className="mt-3 border-t border-amber-200/80 pt-3">
              <PickerButton
                variant="primary"
                className="w-full"
                disabled={!canEnterEditor || busySave}
                disabledReason={!canEnterEditor ? "Сначала сохраните исходники выше" : null}
                onClick={async () => {
                  await onCompleteToEditor(dump, scenario);
                  setDump(null);
                  onClose();
                }}
              >
                {scenario === "etacs_cuf"
                  ? "Открыть .cuf в слоте A для редактирования"
                  : "Открыть .kon в слоте A для редактирования"}
              </PickerButton>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface WriteModalProps {
  open: boolean;
  onClose: () => void;
  slotA: SlotBackupInfo;
  slotB: SlotBackupInfo;
  writeScenario: ObdTargetScenario;
  hasUnsavedEdits: boolean;
  dirtyA: boolean;
  dirtyB: boolean;
  onSaveEditedA: () => Promise<void>;
  onSaveEditedB: () => Promise<void>;
  getCurrentBytesA: () => Promise<Uint8Array>;
  getCurrentBytesB: () => Promise<Uint8Array | null>;
  onBackupSavedA: (iso: string) => void;
  onBackupSavedB: (iso: string) => void;
  cufBackupBytes?: Uint8Array | null;
  cufBackupName?: string;
  onPickCompanionCuf?: (bytes: Uint8Array, name: string) => void;
}

export function EtacsObdWriteModal({
  open,
  onClose,
  slotA,
  slotB,
  writeScenario,
  hasUnsavedEdits,
  dirtyA,
  dirtyB,
  onSaveEditedA,
  onSaveEditedB,
  getCurrentBytesA,
  getCurrentBytesB,
  onBackupSavedA,
  onBackupSavedB,
  cufBackupBytes,
  cufBackupName,
  onPickCompanionCuf,
}: WriteModalProps) {
  if (!open) return null;

  const title =
    writeScenario === "etacs_cuf"
      ? "Загрузить Custom Coding (.cuf) в ETACS"
      : writeScenario === "engine_kon"
        ? "Загрузить Variant Coding (.kon) в ЭБУ двигателя"
        : "Загрузить кодировку в ETACS (.kon + восстановление .cuf)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Файл в слоте A: <span className="font-mono font-medium text-gray-800">{slotA.displayName || "—"}</span>
            </p>
          </div>
          <PickerButton variant="ghost" onClick={onClose} ariaLabel="Закрыть">
            ✕
          </PickerButton>
        </div>

        {hasUnsavedEdits ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-semibold">Прежде чем загрузить в блок, сохраните отредактированные файлы</p>
            <p className="mt-1 leading-relaxed">
              В редакторе есть несохранённые изменения. Сохраните модифицированный файл на устройство — только после этого откроется подключение к блоку и запись.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {dirtyA ? (
                <PickerButton variant="primary" onClick={() => void onSaveEditedA()}>
                  Сохранить модифицированный файл A ({slotA.displayName})
                </PickerButton>
              ) : null}
              {dirtyB ? (
                <PickerButton variant="primary" onClick={() => void onSaveEditedB()}>
                  Сохранить файл B ({slotB.displayName})
                </PickerButton>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-3">
            {writeScenario === "etacs_kon" ? (
              <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
                <strong>Предупреждение ETACS (.kon):</strong> после загрузки модифицированного файла <code>.kon</code> пользовательские настройки в блоке будут сброшены! Обязательно вторым шагом загрузите файл <code>.cuf</code>, чтобы восстановить настройки.
              </div>
            ) : writeScenario === "etacs_cuf" ? (
              <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-950">
                <strong>Режим Custom Coding (.cuf):</strong> в слоте A открыт файл <code>.cuf</code>. Записывается только он в 1 шаг — таблица <code>.kon</code> не затрагивается.
              </div>
            ) : (
              <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-950">
                <strong>Режим ЭБУ Двигателя (ECM):</strong> записывается модифицированный файл <code>.kon</code> двигателя в 1 шаг.
              </div>
            )}
            <EtacsBlockUploadPanel
              embedded
              panelMode="writeOnly"
              targetScenario={writeScenario}
              uploadAllowed={!hasUnsavedEdits}
              slotA={slotA}
              slotB={slotB}
              getCurrentBytesA={getCurrentBytesA}
              getCurrentBytesB={getCurrentBytesB}
              onBackupSavedA={onBackupSavedA}
              onBackupSavedB={onBackupSavedB}
              cufFallbackBytes={cufBackupBytes}
              cufFallbackName={cufBackupName}
              onPickCompanionCuf={onPickCompanionCuf}
            />
          </div>
        )}
      </div>
    </div>
  );
}
