"use client";

import { useMemo, useState } from "react";
import type { InventoryProject } from "@/lib/code-scanner/types";
import type { BaseTableFilter } from "@/lib/code-scanner/project-utils";
import { buildBaseTableView, filterBaseTableRows } from "@/lib/code-scanner/project-utils";
import { useCodeScannerT } from "@/lib/code-scanner/i18n";
import VirtualDataTable from "./VirtualDataTable";

interface Props {
  project: InventoryProject;
}

export default function InventoryBasePanel({ project }: Props) {
  const { t } = useCodeScannerT();
  const [filter, setFilter] = useState<BaseTableFilter>("all");

  const baseView = useMemo(() => buildBaseTableView(project), [project]);
  const filteredRows = useMemo(
    () => filterBaseTableRows(baseView.rows, filter),
    [baseView.rows, filter],
  );

  const filters: { id: BaseTableFilter; label: string }[] = [
    { id: "all", label: t("baseFilterAll") },
    { id: "found", label: t("baseFilterFound") },
    { id: "pending", label: t("baseFilterPending") },
    { id: "not_found", label: t("baseFilterNotFound") },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">{t("baseTabHint")}</p>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-xs rounded-full border ${
              filter === f.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <VirtualDataTable columns={baseView.columns} rows={filteredRows} />
      <p className="text-xs text-gray-400">
        {t("baseRowCount", { shown: filteredRows.length, total: baseView.rows.length })}
      </p>
    </div>
  );
}
