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
import { FormField, compactInputClass } from "./FormField";
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
  span?: 1 | 2;
}[] = [
  { key: "inventoryNumber", labelKey: "inventory.number", max: 30, placeholder: "INV-OS-1001" },
  { key: "code", labelKey: "inventory.code", max: 20, placeholder: "OS0001" },
  { key: "itemName", labelKey: "inventory.itemName", max: 120, span: 2 },
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
    <div className="max-w-lg space-y-2 pt-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2.5 gap-y-1.5">
        {FIELDS.map(({ key, labelKey, max, placeholder, type = "text", span = 1 }) => (
          <FormField
            key={key}
            label={t(labelKey)}
            compact
            className={span === 2 ? "sm:col-span-2" : undefined}
          >
            <input
              className={compactInputClass}
              type={type}
              value={merged[key]}
              maxLength={max}
              placeholder={placeholder}
              onChange={(e) => set({ [key]: clampStorageField(e.target.value, max) })}
            />
          </FormField>
        ))}
      </div>

      <CapacityIndicator info={capacity} variant="inventory" miniLabel={miniLabel} compact />
    </div>
  );
}
