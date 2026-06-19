"use client";

import type { BatchQualityReport, FieldColumnMapping, InventoryLabelBatch } from "@/lib/qr-generator/inventory-batch";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, selectClass } from "../FormField";

interface Props {
  batch: InventoryLabelBatch;
  quality: BatchQualityReport;
  onChange: (batch: InventoryLabelBatch) => void;
  onContinue: () => void;
}

function MappingSelect({
  label,
  value,
  columns,
  onChange,
}: {
  label: string;
  value: string | null;
  columns: InventoryLabelBatch["columns"];
  onChange: (id: string | null) => void;
}) {
  return (
    <FormField label={label}>
      <select
        className={selectClass}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">—</option>
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </FormField>
  );
}

export function BatchQualityPanel({ batch, quality, onChange, onContinue }: Props) {
  const { t } = useQrTranslations();

  const setMapping = (patch: Partial<FieldColumnMapping>) => {
    onChange({
      ...batch,
      fieldMapping: { ...batch.fieldMapping, ...patch },
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <h3 className="text-sm font-semibold">{t("batch.qualityTitle")}</h3>

      {batch.organization && (
        <p className="text-xs text-gray-500">
          {t("batch.orgHeader")}: {batch.organization}
          {batch.department ? ` · ${batch.department}` : ""}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">{t("batch.totalRows")}</p>
          <p className="font-semibold">{quality.totalRows}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">{t("batch.emptyIds")}</p>
          <p className={`font-semibold ${quality.emptyIdentifiers ? "text-amber-700" : ""}`}>
            {quality.emptyIdentifiers}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">{t("batch.duplicates")}</p>
          <p className={`font-semibold ${quality.duplicateIdentifiers.length ? "text-amber-700" : ""}`}>
            {quality.duplicateIdentifiers.length}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">{t("batch.emptyNames")}</p>
          <p className="font-semibold">{quality.emptyNameFields}</p>
        </div>
      </div>

      {quality.duplicateIdentifiers.length > 0 && (
        <p className="text-xs text-amber-700">
          {quality.duplicateIdentifiers.slice(0, 10).join(", ")}
          {quality.duplicateIdentifiers.length > 10 ? "…" : ""}
        </p>
      )}

      <MappingSelect
        label={t("batch.idColumn")}
        value={batch.idColumnId}
        columns={batch.columns}
        onChange={(id) => onChange({ ...batch, idColumnId: id })}
      />

      <div className="grid sm:grid-cols-2 gap-3">
        <MappingSelect
          label={t("batch.mapInventoryNumber")}
          value={batch.fieldMapping.inventoryNumber}
          columns={batch.columns}
          onChange={(id) => setMapping({ inventoryNumber: id })}
        />
        <MappingSelect
          label={t("batch.mapItemName")}
          value={batch.fieldMapping.itemName}
          columns={batch.columns}
          onChange={(id) => setMapping({ itemName: id })}
        />
        <MappingSelect
          label={t("batch.mapDepartment")}
          value={batch.fieldMapping.department}
          columns={batch.columns}
          onChange={(id) => setMapping({ department: id })}
        />
        <MappingSelect
          label={t("batch.mapResponsible")}
          value={batch.fieldMapping.responsible}
          columns={batch.columns}
          onChange={(id) => setMapping({ responsible: id })}
        />
        <MappingSelect
          label={t("batch.mapSerial")}
          value={batch.fieldMapping.serialNumber}
          columns={batch.columns}
          onChange={(id) => setMapping({ serialNumber: id })}
        />
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!batch.idColumnId}
        className="px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-900 text-white disabled:opacity-40"
      >
        {t("batch.continue")}
      </button>
    </div>
  );
}
