"use client";

import type { InventoryFormData } from "@/lib/qr-generator/types";
import {
  INVENTORY_SOFT_MAX_BYTES,
  MINI_LABEL_MAX_BYTES,
  getCapacityInfo,
} from "@/lib/qr-generator/capacity";
import {
  buildInventoryPayload,
  clampStorageField,
} from "@/lib/qr-generator/storageSerializers";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, inputClass, textareaClass } from "./FormField";
import { CapacityIndicator } from "./CapacityIndicator";

interface InventoryFormProps {
  data: InventoryFormData;
  onChange: (data: InventoryFormData) => void;
  miniLabel?: boolean;
}

export function InventoryForm({ data, onChange, miniLabel }: InventoryFormProps) {
  const { t } = useQrTranslations();
  const set = (patch: Partial<InventoryFormData>) => onChange({ ...data, ...patch });

  const payload = buildInventoryPayload(data);
  const maxBytes = miniLabel ? MINI_LABEL_MAX_BYTES : INVENTORY_SOFT_MAX_BYTES;
  const capacity = getCapacityInfo(payload, maxBytes);

  return (
    <div className="space-y-3">
      <FormField label={t("inventory.number")}>
        <input
          className={inputClass}
          value={data.inventoryNumber}
          maxLength={30}
          placeholder="ОС-00231"
          onChange={(e) => set({ inventoryNumber: clampStorageField(e.target.value, 30) })}
        />
      </FormField>

      <FormField label={t("inventory.itemName")}>
        <input
          className={inputClass}
          value={data.itemName}
          maxLength={80}
          onChange={(e) => set({ itemName: clampStorageField(e.target.value, 80) })}
        />
      </FormField>

      <FormField label={t("inventory.department")}>
        <input
          className={inputClass}
          value={data.department}
          maxLength={60}
          onChange={(e) => set({ department: clampStorageField(e.target.value, 60) })}
        />
      </FormField>

      <FormField label={t("inventory.responsible")}>
        <input
          className={inputClass}
          value={data.responsible}
          maxLength={60}
          onChange={(e) => set({ responsible: clampStorageField(e.target.value, 60) })}
        />
      </FormField>

      <FormField label={t("inventory.serial")}>
        <input
          className={inputClass}
          value={data.serialNumber}
          maxLength={40}
          onChange={(e) => set({ serialNumber: clampStorageField(e.target.value, 40) })}
        />
      </FormField>

      <FormField label={t("inventory.comment")}>
        <textarea
          className={textareaClass}
          value={data.comment}
          maxLength={200}
          onChange={(e) => set({ comment: clampStorageField(e.target.value, 200) })}
        />
      </FormField>

      <CapacityIndicator info={capacity} variant="inventory" miniLabel={miniLabel} />
    </div>
  );
}
