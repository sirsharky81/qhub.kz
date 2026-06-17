"use client";

import { useRef, useState } from "react";
import type { StorageFormData, StorageItemRow, StorageLocationType } from "@/lib/qr-generator/types";
import {
  STORAGE_MAX_BYTES,
  getCapacityInfo,
} from "@/lib/qr-generator/capacity";
import { buildStoragePayload, clampStorageField, newStorageItem } from "@/lib/qr-generator/storageSerializers";
import { STORAGE_PRESETS, applyStoragePreset } from "@/lib/qr-generator/storagePresets";
import {
  autoDetectColumns,
  parseImportFile,
  rowsToStorageItems,
  type ImportColumnMapping,
} from "@/lib/qr-generator/importStorageItems";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { PickerButton } from "../../random-picker/components/PickerButton";
import { FormField, inputClass, selectClass, textareaClass } from "./FormField";
import { CapacityIndicator } from "./CapacityIndicator";

interface StorageFormProps {
  data: StorageFormData;
  onChange: (data: StorageFormData) => void;
  miniLabel?: boolean;
}

const LOCATION_TYPES: StorageLocationType[] = [
  "cabinet",
  "rack",
  "garage",
  "warehouse",
  "room",
  "shelf",
  "other",
];

export function StorageForm({ data, onChange, miniLabel }: StorageFormProps) {
  const { t } = useQrTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportColumnMapping | null>(null);

  const set = (patch: Partial<StorageFormData>) => onChange({ ...data, ...patch });

  const payload = buildStoragePayload(data);
  const capacity = getCapacityInfo(payload, STORAGE_MAX_BYTES);

  const updateItem = (id: string, patch: Partial<StorageItemRow>) => {
    set({
      items: data.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  };

  const moveItem = (id: string, dir: -1 | 1) => {
    const idx = data.items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= data.items.length) return;
    const items = [...data.items];
    [items[idx], items[next]] = [items[next]!, items[idx]!];
    set({ items });
  };

  const handleImport = async (file: File) => {
    const sheet = await parseImportFile(file);
    const detected = autoDetectColumns(sheet.headers);
    setImportHeaders(sheet.headers);
    setImportRows(sheet.rows);
    setMapping(detected);
    if (detected) {
      applyImport(sheet.rows, detected);
    }
  };

  const applyImport = (rows: string[][], map: ImportColumnMapping) => {
    const imported = rowsToStorageItems(rows, map);
    if (!imported.length) return;
    const merged = [...data.items.filter((i) => i.name.trim()), ...imported];
    const testPayload = buildStoragePayload({ ...data, items: merged });
    const cap = getCapacityInfo(testPayload, STORAGE_MAX_BYTES);
    if (cap.overflow) {
      const ok = window.confirm(t("import.trimConfirm"));
      if (!ok) return;
      let trimmed = merged;
      while (trimmed.length > 0) {
        const p = buildStoragePayload({ ...data, items: trimmed });
        if (!getCapacityInfo(p, STORAGE_MAX_BYTES).overflow) break;
        trimmed = trimmed.slice(0, -1);
      }
      set({ items: trimmed });
    } else {
      set({ items: merged });
    }
    setImportHeaders([]);
    setImportRows([]);
    setMapping(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {STORAGE_PRESETS.map((preset) => (
          <PickerButton
            key={preset.id}
            variant="ghost"
            onClick={() => onChange(applyStoragePreset(data, preset))}
          >
            {t(preset.nameKey)}
          </PickerButton>
        ))}
      </div>

      <FormField label={t("storage.name")}>
        <input
          className={inputClass}
          value={data.name}
          maxLength={60}
          onChange={(e) => set({ name: clampStorageField(e.target.value, 60) })}
        />
      </FormField>

      <FormField label={t("storage.boxNumber")} hint={t("storage.boxHint")}>
        <input
          className={inputClass}
          value={data.boxNumber}
          maxLength={20}
          placeholder="BOX-015"
          onChange={(e) => set({ boxNumber: clampStorageField(e.target.value, 20) })}
        />
      </FormField>

      <FormField label={t("storage.locationType")}>
        <select
          className={selectClass}
          value={data.locationType}
          onChange={(e) =>
            set({ locationType: e.target.value as StorageLocationType | "" })
          }
        >
          <option value="">—</option>
          {LOCATION_TYPES.map((lt) => (
            <option key={lt} value={lt}>
              {t(`storage.loc.${lt}`)}
            </option>
          ))}
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("storage.locationNumber")}>
          <input
            className={inputClass}
            value={data.locationNumber}
            maxLength={30}
            onChange={(e) => set({ locationNumber: clampStorageField(e.target.value, 30) })}
          />
        </FormField>
        <FormField label={t("storage.locationSection")}>
          <input
            className={inputClass}
            value={data.locationSection}
            maxLength={20}
            onChange={(e) => set({ locationSection: clampStorageField(e.target.value, 20) })}
          />
        </FormField>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
            {t("storage.contents")}
          </span>
          <div className="flex gap-1">
            <PickerButton variant="ghost" onClick={() => fileRef.current?.click()}>
              {t("storage.import")}
            </PickerButton>
            <PickerButton variant="secondary" onClick={() => set({ items: [...data.items, newStorageItem()] })}>
              {t("storage.addItem")}
            </PickerButton>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
            e.target.value = "";
          }}
        />

        {importHeaders.length > 0 && !mapping && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs">
            <p className="text-amber-900">{t("import.mapColumns")}</p>
            {(["nameCol", "quantityCol"] as const).map((key) => (
              <label key={key} className="flex items-center gap-2">
                <span className="w-24">{t(`import.${key}`)}</span>
                <select
                  className={selectClass}
                  defaultValue={0}
                  id={`map-${key}`}
                >
                  {importHeaders.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `#${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <PickerButton
              variant="primary"
              onClick={() => {
                const nameEl = document.getElementById("map-nameCol") as HTMLSelectElement;
                const qtyEl = document.getElementById("map-quantityCol") as HTMLSelectElement;
                applyImport(importRows, {
                  nameCol: parseInt(nameEl.value, 10),
                  quantityCol: parseInt(qtyEl.value, 10),
                  commentCol: null,
                });
              }}
            >
              {t("import.apply")}
            </PickerButton>
          </div>
        )}

        <ul className="space-y-2">
          {data.items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-gray-200 bg-white p-3 space-y-2"
            >
              <div className="flex gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  placeholder={t("storage.itemName")}
                  value={item.name}
                  maxLength={60}
                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="w-8 h-8 rounded border border-gray-200 text-sm"
                    onClick={() =>
                      updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })
                    }
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                  <button
                    type="button"
                    className="w-8 h-8 rounded border border-gray-200 text-sm"
                    onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}
                  >
                    +
                  </button>
                </div>
              </div>
              <input
                className={inputClass}
                placeholder={t("storage.itemComment")}
                value={item.comment}
                maxLength={60}
                onChange={(e) => updateItem(item.id, { comment: e.target.value })}
              />
              <div className="flex gap-1 justify-end">
                <PickerButton variant="ghost" onClick={() => moveItem(item.id, -1)}>
                  ↑
                </PickerButton>
                <PickerButton variant="ghost" onClick={() => moveItem(item.id, 1)}>
                  ↓
                </PickerButton>
                <PickerButton
                  variant="ghost"
                  onClick={() => set({ items: data.items.filter((i) => i.id !== item.id) })}
                >
                  {t("delete")}
                </PickerButton>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <FormField label={t("storage.comment")}>
        <textarea
          className={textareaClass}
          value={data.comment}
          maxLength={200}
          onChange={(e) => set({ comment: clampStorageField(e.target.value, 200) })}
        />
      </FormField>

      <CapacityIndicator info={capacity} variant="storage" miniLabel={miniLabel} />
    </div>
  );
}
