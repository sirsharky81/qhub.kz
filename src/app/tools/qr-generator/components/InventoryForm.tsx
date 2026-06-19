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
import { emptyForm } from "@/lib/qr-generator/qrUtils";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, inputClass } from "./FormField";
import { CapacityIndicator } from "./CapacityIndicator";

interface InventoryFormProps {
  data: InventoryFormData;
  onChange: (data: InventoryFormData) => void;
  miniLabel?: boolean;
}

const EMPTY = emptyForm("inventory").data as InventoryFormData;

const FIELDS: {
  key: keyof InventoryFormData;
  labelKey: string;
  max: number;
  placeholder?: string;
  type?: "text" | "date";
}[] = [
  { key: "inventoryNumber", labelKey: "inventory.number", max: 30, placeholder: "INV-OS-1001" },
  { key: "code", labelKey: "inventory.code", max: 20, placeholder: "OS0001" },
  { key: "itemName", labelKey: "inventory.itemName", max: 120 },
  { key: "category", labelKey: "inventory.category", max: 80 },
  { key: "department", labelKey: "inventory.department", max: 60 },
  { key: "responsible", labelKey: "inventory.responsible", max: 60 },
  { key: "entryDate", labelKey: "inventory.entryDate", max: 20, type: "date" },
  { key: "initialCost", labelKey: "inventory.initialCost", max: 20, placeholder: "355000" },
  { key: "condition", labelKey: "inventory.condition", max: 40, placeholder: "В эксплуатации" },
];

export function InventoryForm({ data, onChange, miniLabel }: InventoryFormProps) {
  const { t } = useQrTranslations();
  const merged = { ...EMPTY, ...data };
  const set = (patch: Partial<InventoryFormData>) => onChange({ ...merged, ...patch });

  const payload = buildInventoryPayload(merged);
  const maxBytes = miniLabel ? MINI_LABEL_MAX_BYTES : INVENTORY_SOFT_MAX_BYTES;
  const capacity = getCapacityInfo(payload, maxBytes);

  return (
    <div className="space-y-3">
      {FIELDS.map(({ key, labelKey, max, placeholder, type = "text" }) => (
        <FormField key={key} label={t(labelKey)}>
          <input
            className={inputClass}
            type={type}
            value={merged[key]}
            maxLength={max}
            placeholder={placeholder}
            onChange={(e) => set({ [key]: clampStorageField(e.target.value, max) })}
          />
        </FormField>
      ))}

      <CapacityIndicator info={capacity} variant="inventory" miniLabel={miniLabel} />
    </div>
  );
}
