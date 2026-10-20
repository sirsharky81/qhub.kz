"use client";

import type { EtacsCodingDump } from "@/lib/obd/mitsubishi-etacs";
import { PickerButton } from "../random-picker/components/PickerButton";
import EtacsBlockUploadPanel from "./EtacsBlockUploadPanel";

export interface EtacsSlotSummary {
  displayName: string;
  originalBytes: Uint8Array | null;
  backupSavedAt: string | null;
  hasFile: boolean;
  loadSource: "disk" | "obd" | null;
}

interface Props {
  slotA: EtacsSlotSummary;
  slotB: EtacsSlotSummary;
  editingLocked: boolean;
  obdBackupHint: string | null;
  hasUnsavedEdits: boolean;
  uploadAllowed: boolean;
  uploadBlockedReason: string | null;
  onPickFileA: () => void;
  onPickFileB: () => void;
  onSaveOriginalA: () => void;
  onSaveOriginalB: () => void;
  onSaveAllObdOriginals: () => void;
  onSaveEditedA: () => void;
  onSaveEditedB: () => void;
  onObdDumpRead: (dump: EtacsCodingDump) => void | Promise<void>;
  getCurrentBytesA: () => Promise<Uint8Array>;
  getCurrentBytesB: () => Promise<Uint8Array | null>;
  onBackupSavedA: (iso: string) => void;
  onBackupSavedB: (iso: string) => void;
}

export function EtacsWorkflowPanel({
  slotA,
  slotB,
  editingLocked,
  obdBackupHint,
  hasUnsavedEdits,
  uploadAllowed,
  uploadBlockedReason,
  onPickFileA,
  onPickFileB,
  onSaveOriginalA,
  onSaveOriginalB,
  onSaveAllObdOriginals,
  onSaveEditedA,
  onSaveEditedB,
  onObdDumpRead,
  getCurrentBytesA,
  getCurrentBytesB,
  onBackupSavedA,
  onBackupSavedB,
}: Props) {
  const obdCufSlot = slotB.loadSource === "obd" && slotB.hasFile;

  return (
    <section className="mb-3 space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Данные в редактор</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Файл A — рабочий (.kon). Считывание с ETACS загружает .kon в A
          {obdCufSlot ? " и .cuf в B" : ""}. Файл B — только для сравнения или .cuf после выгрузки.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <PickerButton variant="primary" onClick={onPickFileA}>
            Файл с диска → A
          </PickerButton>
          <PickerButton variant="secondary" onClick={onPickFileB}>
            Файл для сравнения → B
          </PickerButton>
          {slotA.hasFile ? (
            <PickerButton variant="secondary" onClick={onSaveEditedA}>
              Сохранить правки A
            </PickerButton>
          ) : null}
          {slotB.hasFile ? (
            <PickerButton variant="secondary" onClick={onSaveEditedB}>
              Сохранить правки B
            </PickerButton>
          ) : null}
        </div>
      </div>

      {editingLocked && obdBackupHint ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
          <p className="font-semibold">Прежде чем начать редактировать, сохраните выгруженные исходники</p>
          <p className="mt-1">{obdBackupHint}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <PickerButton variant="primary" disabled={!slotA.originalBytes} onClick={onSaveOriginalA}>
              Сохранить исходник A (.kon)
            </PickerButton>
            {obdCufSlot ? (
              <PickerButton variant="primary" disabled={!slotB.originalBytes} onClick={onSaveOriginalB}>
                Сохранить исходник B (.cuf)
              </PickerButton>
            ) : null}
            {obdCufSlot ? (
              <PickerButton variant="secondary" onClick={onSaveAllObdOriginals}>
                Сохранить оба исходника
              </PickerButton>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasUnsavedEdits ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-950">
          <p className="font-semibold">Есть несохранённые правки</p>
          <p className="mt-0.5">
            Перед записью в блок сохраните отредактированные файлы кнопками «Сохранить правки A» (и B, если меняли).
          </p>
        </div>
      ) : null}

      {!uploadAllowed && uploadBlockedReason && slotA.hasFile ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {uploadBlockedReason}
        </div>
      ) : null}

      <EtacsBlockUploadPanel
        embedded
        slotA={slotA}
        slotB={slotB}
        uploadAllowed={uploadAllowed}
        getCurrentBytesA={getCurrentBytesA}
        getCurrentBytesB={getCurrentBytesB}
        onBackupSavedA={onBackupSavedA}
        onBackupSavedB={onBackupSavedB}
        onObdDumpRead={onObdDumpRead}
      />
    </section>
  );
}
