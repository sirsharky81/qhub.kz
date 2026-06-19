"use client";

import type { InventoryProject } from "@/lib/code-scanner/types";
import { scanViewForProject } from "@/lib/code-scanner/project-utils";
import { useCodeScannerT } from "@/lib/code-scanner/i18n";

type WorkspaceView = "scan-a" | "scan-b" | "base" | "reports";

interface Props {
  project: InventoryProject;
  view: WorkspaceView;
  onTab: (view: WorkspaceView) => void;
}

export default function InventoryProjectTabs({ project, view, onTab }: Props) {
  const { t } = useCodeScannerT();
  const scanView = scanViewForProject(project);

  const tabs: { id: WorkspaceView; label: string }[] = [
    { id: scanView, label: t("tabScan") },
  ];
  if (project.scenario === "with-base" && project.baseRows.length > 0) {
    tabs.push({ id: "base", label: t("tabBase") });
  }
  tabs.push({ id: "reports", label: t("tabReports") });

  const activeView = view === "scan-a" || view === "scan-b" ? scanView : view;

  return (
    <div className="flex gap-1 p-1 rounded-xl bg-gray-100 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTab(tab.id)}
          className={`flex-1 min-w-[88px] px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
            activeView === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export type { WorkspaceView };
