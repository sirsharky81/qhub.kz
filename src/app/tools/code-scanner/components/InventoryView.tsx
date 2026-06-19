"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CameraScanner, { CameraToggle, ScanSessionControls } from "./CameraScanner";
import ManualInputModal from "./ManualInputModal";
import VirtualDataTable from "./VirtualDataTable";
import InventoryBasePanel from "./InventoryBasePanel";
import InventoryProjectTabs, { type WorkspaceView } from "./InventoryProjectTabs";
import ConfirmModal from "./ConfirmModal";
import { useCodeScannerT } from "@/lib/code-scanner/i18n";
import type { InventoryProject, InventoryScenario, MatchQuality, OrgForm, ScanSessionSettings } from "@/lib/code-scanner/types";
import { DEFAULT_SCAN_SETTINGS, IDENTIFIER_COLUMN_ID, PHOTO_SIZE_WARNING_BYTES } from "@/lib/code-scanner/types";
import {
  addDuplicateEntry,
  addLedgerScan,
  addSurplusEntry,
  analyzeBaseQuality,
  createEmptyProject,
  deleteLedgerRow,
  incrementScanOnly,
  markExported,
  previewMapping,
  processBaseScan,
  renameLedgerColumn,
  suggestIdColumn,
  parseSpreadsheetToBase,
  buildLedgerTableView,
  finalizeProject,
  reopenProject,
  scanViewForProject,
  isProjectReadOnly,
} from "@/lib/code-scanner/project-utils";
import {
  deleteProject,
  exportProjectFile,
  importProjectFile,
  listProjectDisplayNumbers,
  listProjectSummaries,
  loadProject,
  readSpreadsheetFile,
  saveProject,
  setActiveProjectId,
  getActiveProjectId,
  clearActiveProjectId,
} from "@/lib/code-scanner/storage";
import { buildReports, getLastScanCard, reportToCsvContent } from "@/lib/code-scanner/reports";
import {
  downloadCsv,
  downloadText,
  downloadXlsxIfAllowed,
  downloadZip,
  slugFilename,
} from "@/lib/code-scanner/export-utils";
import { compressPhoto, estimateDataUrlBytes } from "@/lib/code-scanner/photo-compress";
import { nowIso } from "@/lib/code-scanner/parse-content";

type InvView =
  | "list"
  | "create"
  | "scenario"
  | "scan-a"
  | "upload-b"
  | "preview-b"
  | "quality-b"
  | "mapping-b"
  | "scan-b"
  | "base"
  | "reports";

interface Props {
  onBack: () => void;
}

export default function InventoryView({ onBack }: Props) {
  const { t } = useCodeScannerT();
  const [view, setView] = useState<InvView>("list");
  const [summaries, setSummaries] = useState<Awaited<ReturnType<typeof listProjectSummaries>>>([]);
  const [project, setProject] = useState<InventoryProject | null>(null);
  const [settings, setSettings] = useState<ScanSessionSettings>(DEFAULT_SCAN_SETTINGS);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [scanningActive, setScanningActive] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string; name: string; exported: boolean } | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mappingPreview, setMappingPreview] = useState<{ matched: number; total: number } | null>(null);
  const [duplicateAsk, setDuplicateAsk] = useState<{ identifier: string; when: string; baseRowId: string; ledgerRowId: string } | null>(null);
  const [formModal, setFormModal] = useState<"duplicate" | "surplus" | null>(null);
  const [formState, setFormState] = useState({ location: "", description: "", matchesBase: "" as MatchQuality | "", comment: "", photo: "" as string | null });
  const [pendingSurplus, setPendingSurplus] = useState<{ identifier: string; ledgerRowId: string; raw: string } | null>(null);
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null);
  const [resumeAsk, setResumeAsk] = useState<string | null>(null);
  const [reopenAsk, setReopenAsk] = useState(false);

  const readOnly = project ? isProjectReadOnly(project) : false;
  const inWorkspace =
    view === "scan-a" || view === "scan-b" || view === "base" || view === "reports";

  const refreshList = useCallback(async () => {
    setSummaries(await listProjectSummaries());
  }, []);

  useEffect(() => {
    void refreshList();
    const active = getActiveProjectId();
    if (active) setResumeAsk(active);
  }, [refreshList]);

  useEffect(() => {
    if (view !== "scan-a" && view !== "scan-b") {
      setScanningActive(false);
    }
  }, [view]);

  useEffect(() => {
    if (!project) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (project.status === "active") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [project]);

  async function persist(next: InventoryProject) {
    setProject(next);
    await saveProject(next);
    setActiveProjectId(next.projectId);
    void refreshList();
  }

  async function startCreate() {
    const numbers = await listProjectDisplayNumbers();
    setProject(createEmptyProject(numbers));
    setView("create");
  }

  async function submitCreate() {
    if (!project?.name.trim() || !project.organization.trim() || !project.inventorName.trim()) return;
    await persist(project);
    setView("scenario");
  }

  async function chooseScenario(scenario: InventoryScenario) {
    if (!project) return;
    const next = { ...project, scenario };
    await persist(next);
    setView(scenario === "without-base" ? "scan-a" : "upload-b");
  }

  async function openProject(id: string) {
    const loaded = await loadProject(id);
    if (!loaded) return;
    setProject(loaded);
    if (loaded.status === "completed") setView("reports");
    else if (loaded.scenario === "with-base" && loaded.mappingConfirmed) setView("scan-b");
    else if (loaded.scenario === "with-base" && loaded.baseRows.length) setView(loaded.baseIdColumnId ? "mapping-b" : "quality-b");
    else if (loaded.scenario === "with-base") setView("upload-b");
    else if (loaded.scenario === "without-base") setView("scan-a");
    else setView("scenario");
  }

  const ledgerView = useMemo(() => (project ? buildLedgerTableView(project) : { columns: [], rows: [] }), [project]);

  const handleScanA = useCallback(
    async (raw: string) => {
      if (!project || isProjectReadOnly(project)) return;
      const next = addLedgerScan(project, raw);
      await persist(next);
    },
    [project],
  );

  const handleScanB = useCallback(
    async (raw: string) => {
      if (!project || isProjectReadOnly(project)) return;
      const result = processBaseScan(project, raw);
      if (result.kind === "duplicate" && result.baseRow) {
        const prev = project.ledgerRows.find((r) => r.baseRowId === result.baseRow!.id && r.status === "found");
        setDuplicateAsk({
          identifier: result.identifier,
          when: prev ? new Date(prev.scannedAt).toLocaleString("ru-RU") : "",
          baseRowId: result.baseRow.id,
          ledgerRowId: result.ledgerRowId,
        });
        await persist(result.project);
        return;
      }
      if (result.kind === "surplus") {
        setPendingSurplus({ identifier: result.identifier, ledgerRowId: result.ledgerRowId, raw });
        setFormModal("surplus");
        await persist(result.project);
        return;
      }
      let next = result.project;
      if (project.photoEveryScan) {
        /* photo capture triggered separately via file input in UI */
      }
      await persist(next);
    },
    [project],
  );

  async function handleBaseUpload(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xls") alert(t("xlsHint"));
    const aoa = await readSpreadsheetFile(file);
    setPreviewRows(aoa.slice(0, 21));
    if (!project) return;
    const parsed = parseSpreadsheetToBase(aoa);
    const idCol = suggestIdColumn(parsed.columns);
    const next = {
      ...project,
      baseColumns: parsed.columns,
      baseRows: parsed.rows,
      baseIdColumnId: idCol,
    };
    await persist(next);
    setView("preview-b");
  }

  async function confirmQuality() {
    setView("mapping-b");
  }

  async function runMappingCheck() {
    if (!project) return;
    setMappingPreview(previewMapping(project));
  }

  async function confirmMapping() {
    if (!project) return;
    await persist({ ...project, mappingConfirmed: true });
    setView("scan-b");
  }

  async function completeProject() {
    if (!project || readOnly) return;
    const finalized = finalizeProject(project);
    await persist(finalized);
    setView("reports");
  }

  async function confirmReopenProject() {
    if (!project) return;
    const next = reopenProject(project);
    await persist(next);
    setReopenAsk(false);
    setView(scanViewForProject(next));
  }

  function handleBackClick() {
    if (!project) {
      if (view === "list") onBack();
      else setView("list");
      return;
    }
    if (view === "base" || view === "reports") {
      setView(scanViewForProject(project));
      return;
    }
    if (view === "scan-a" || view === "scan-b") {
      setProject(null);
      setView("list");
      clearActiveProjectId();
      return;
    }
    if (view === "list") {
      onBack();
      return;
    }
    setView("list");
  }

  function goWorkspaceTab(tab: WorkspaceView) {
    setView(tab);
  }

  async function exportProject() {
    if (!project) return;
    const payload = exportProjectFile(markExported(project));
    downloadText(JSON.stringify(payload, null, 2), `${project.displayNumber}.qhub-inventory`, "application/json");
    await persist(markExported(project));
  }

  async function importProject(file: File) {
    const loaded = await importProjectFile(file);
    setProject(loaded);
    setActiveProjectId(loaded.projectId);
    await refreshList();
    void openProject(loaded.projectId);
  }

  const quality = project
    ? analyzeBaseQuality(
        project.baseRows,
        project.baseIdColumnId,
        project.baseColumns.filter((c) => c.name.toLowerCase().includes("наимен")).map((c) => c.id),
      )
    : null;

  const lastCard = project ? getLastScanCard(project) : null;

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={handleBackClick} className="self-start text-xs text-gray-500 hover:text-gray-800">
        ← {inWorkspace && (view === "base" || view === "reports") ? t("backToScan") : view === "list" ? t("back") : t("backToProjects")}
      </button>

      {inWorkspace && project && (
        <>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-sm font-semibold text-gray-900">{project.displayNumber}</p>
            <p className="text-xs text-gray-600 truncate">{project.name}</p>
          </div>
          <InventoryProjectTabs project={project} view={view as WorkspaceView} onTab={goWorkspaceTab} />
          {readOnly && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2">
              <p className="text-xs text-amber-900 flex-1">{t("readOnlyHint")}</p>
              <button
                type="button"
                onClick={() => setReopenAsk(true)}
                className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-white text-amber-900"
              >
                {t("reopenProject")}
              </button>
            </div>
          )}
        </>
      )}

      {view === "list" && (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void startCreate()} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white">
              {t("createProject")}
            </button>
            <label className="px-4 py-2 text-sm rounded-lg border border-gray-200 cursor-pointer">
              {t("importProject")}
              <input type="file" accept=".qhub-inventory,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void importProject(e.target.files[0])} />
            </label>
          </div>
          <div className="grid gap-3">
            {summaries.map((s) => (
              <div key={s.projectId} className="rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{s.displayNumber}</p>
                  <p className="text-sm text-gray-800 truncate">{s.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(s.createdAt).toLocaleDateString("ru-RU")} · {s.status === "active" ? t("active") : t("completed")}
                    {s.scenario === "with-base" && ` · ${t("foundSummary", { found: s.foundCount, total: s.totalBaseCount })}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void openProject(s.projectId)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200">
                    {t("openProject")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void loadProject(s.projectId).then((p) => {
                        if (p) setDeleteTarget({ id: p.projectId, number: p.displayNumber, name: p.name, exported: p.exportedOnce });
                      });
                    }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600"
                  >
                    {t("deleteProject")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "create" && project && (
        <div className="rounded-2xl border border-gray-200 p-4 space-y-3 max-w-lg">
          <p className="text-xs text-gray-500">{project.displayNumber}</p>
          {[
            ["projectName", "name"],
            ["organization", "organization"],
            ["inventor", "inventorName"],
            ["startDate", "startDate"],
            ["comment", "comment"],
          ].map(([label, field]) => (
            <label key={field} className="block text-sm">
              <span className="text-xs text-gray-500">{t(label)}</span>
              {field === "comment" ? (
                <textarea
                  value={project.comment}
                  onChange={(e) => setProject({ ...project, comment: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  rows={2}
                />
              ) : (
                <input
                  type={field === "startDate" ? "date" : "text"}
                  value={String(project[field as keyof InventoryProject] ?? "")}
                  onChange={(e) => setProject({ ...project, [field]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              )}
            </label>
          ))}
          <label className="block text-sm">
            <span className="text-xs text-gray-500">{t("orgForm")}</span>
            <select
              value={project.orgForm}
              onChange={(e) => setProject({ ...project, orgForm: e.target.value as OrgForm })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="ip">ИП</option>
              <option value="too">ТОО</option>
              <option value="ao">АО</option>
              <option value="other">Иное</option>
            </select>
          </label>
          <button type="button" onClick={() => setShowMore((v) => !v)} className="text-xs text-sky-600">
            {t("showMore")}
          </button>
          {showMore && (
            <div className="space-y-2">
              {(["department", "branch", "address", "defaultMol", "orderNumber", "commission", "phone", "email", "plannedEndDate"] as const).map((f) => (
                <input
                  key={f}
                  value={project[f]}
                  onChange={(e) => setProject({ ...project, [f]: e.target.value })}
                  placeholder={f}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              ))}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={project.photoEveryScan}
              onChange={(e) => setProject({ ...project, photoEveryScan: e.target.checked })}
            />
            <span>
              {t("photoEveryScan")}
              {project.photoEveryScan && <span className="block text-xs text-amber-700 mt-1">{t("photoWarn")}</span>}
            </span>
          </label>
          <button type="button" onClick={() => void submitCreate()} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white">
            {t("create")}
          </button>
        </div>
      )}

      {view === "scenario" && project && (
        <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
          <button type="button" onClick={() => void chooseScenario("without-base")} className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300">
            <p className="font-semibold text-sm">{t("scenarioA")}</p>
          </button>
          <button type="button" onClick={() => void chooseScenario("with-base")} className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300">
            <p className="font-semibold text-sm">{t("scenarioB")}</p>
          </button>
        </div>
      )}

      {(view === "scan-a" || view === "scan-b") && project && (
        <>
          {!readOnly ? (
            <>
              <CameraToggle
                enabled={cameraEnabled}
                onChange={(enabled) => {
                  setCameraEnabled(enabled);
                  if (!enabled) setScanningActive(false);
                }}
              />
              {cameraEnabled ? (
                <>
                  {!scanningActive ? (
                    <>
                      <p className="text-xs text-gray-500 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                        {t("inventoryScanHint")}
                      </p>
                      <button
                        type="button"
                        onClick={() => setScanningActive(true)}
                        className="w-full sm:w-auto px-4 py-3 text-sm font-medium rounded-xl bg-gray-900 text-white"
                      >
                        {t("startScanning")}
                      </button>
                    </>
                  ) : (
                    <>
                      <ScanSessionControls settings={settings} onChange={setSettings} />
                      <button
                        type="button"
                        onClick={() => setScanningActive(false)}
                        className="w-full sm:w-auto px-4 py-2.5 text-sm rounded-xl border border-red-200 bg-red-50 text-red-800"
                      >
                        {t("stopScanning")}
                      </button>
                      <CameraScanner
                        active={scanningActive}
                        continuous
                        settings={settings}
                        onScan={view === "scan-a" ? handleScanA : handleScanB}
                        onManualInput={() => setManualOpen(true)}
                      />
                    </>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-500 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                  {t("manualOnlyHint")}
                </p>
              )}
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="w-full sm:w-auto px-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white"
              >
                {t("manualInput")}
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-500 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              {t("scanDisabledReadOnly")}
            </p>
          )}
          {project.totalPhotoBytes > PHOTO_SIZE_WARNING_BYTES && (
            <p className="text-xs text-amber-700">{t("photoSizeWarn")}</p>
          )}
          {lastCard && view === "scan-b" && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
              <p className="text-xs font-medium text-sky-800">{t("lastScan")}</p>
              <p>{lastCard.identifier} · {lastCard.statusLabel}</p>
              {lastCard.name && <p className="text-xs text-gray-600">{lastCard.name}</p>}
              {(lastCard.mol || lastCard.location) && (
                <p className="text-xs text-gray-500">
                  {[lastCard.mol, lastCard.location].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}
          <h3 className="text-sm font-semibold">{t("ledger")}</h3>
          <VirtualDataTable
            columns={ledgerView.columns}
            rows={ledgerView.rows}
            onRenameColumn={
              readOnly
                ? undefined
                : (id, name) => {
                    if (id.startsWith("base-") || id === "status" || id === "scannedAt") return;
                    void persist(renameLedgerColumn(project, id, name));
                  }
            }
            onDeleteRow={readOnly ? undefined : (id) => setDeleteRowId(id)}
          />
          {!readOnly && view === "scan-b" && (
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => void completeProject()} className="px-3 py-2 text-xs rounded-lg bg-gray-900 text-white">
                {t("completeProject")}
              </button>
            </div>
          )}
        </>
      )}

      {view === "base" && project && project.scenario === "with-base" && project.baseRows.length > 0 && (
        <InventoryBasePanel project={project} />
      )}

      {view === "base" && project && (project.scenario !== "with-base" || !project.baseRows.length) && (
        <p className="text-sm text-gray-500">{t("baseNotAvailable")}</p>
      )}

      {view === "upload-b" && project && (
        <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 p-8 cursor-pointer hover:border-gray-300">
          <span className="text-sm font-medium">{t("uploadBase")}</span>
          <span className="text-xs text-gray-500 mt-1">XLSX, CSV, TXT</span>
          <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void handleBaseUpload(e.target.files[0])} />
        </label>
      )}

      {view === "preview-b" && project && (
        <>
          <h3 className="text-sm font-semibold">{t("previewBase")}</h3>
          <div className="overflow-auto border rounded-xl max-h-64">
            <table className="min-w-full text-xs">
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1">{String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="block text-sm">
            <span className="text-xs text-gray-500">{t("selectIdColumn")}</span>
            <select
              value={project.baseIdColumnId ?? ""}
              onChange={(e) => setProject({ ...project, baseIdColumnId: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {project.baseColumns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">{t("idColumnHint")}</span>
          </label>
          <button type="button" onClick={() => { void persist(project); setView("quality-b"); }} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white">
            {t("continue")}
          </button>
        </>
      )}

      {view === "quality-b" && project && quality && (
        <>
          <h3 className="text-sm font-semibold">{t("qualityCheck")}</h3>
          <ul className="text-sm space-y-1">
            <li>{t("totalRows")}: {quality.totalRows}</li>
            <li>{t("emptyIds")}: {quality.emptyIdentifiers}</li>
            <li>{t("duplicateIds")}: {quality.duplicateIdentifiers.length}</li>
          </ul>
          {quality.duplicateIdentifiers.length > 0 && (
            <p className="text-xs text-gray-500">{quality.duplicateIdentifiers.slice(0, 10).join(", ")}</p>
          )}
          <button type="button" onClick={() => void confirmQuality()} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white">
            {t("continue")}
          </button>
        </>
      )}

      {view === "mapping-b" && project && (
        <>
          <label className="block text-sm">
            <span className="text-xs text-gray-500">{t("matchBaseColumn")}</span>
            <select
              value={project.baseIdColumnId ?? ""}
              onChange={(e) => setProject({ ...project, baseIdColumnId: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {project.baseColumns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs text-gray-500">{t("matchLedgerColumn")}</span>
            <select
              value={project.ledgerMatchColumnId ?? IDENTIFIER_COLUMN_ID}
              onChange={(e) => setProject({ ...project, ledgerMatchColumnId: e.target.value || IDENTIFIER_COLUMN_ID })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {project.ledgerColumns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void runMappingCheck()} className="px-4 py-2 text-sm rounded-lg border border-gray-200">
            {t("checkMapping")}
          </button>
          {mappingPreview && (
            <p className="text-sm">{t("mappingResult", { matched: mappingPreview.matched, total: mappingPreview.total })}</p>
          )}
          <button type="button" onClick={() => void confirmMapping()} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white">
            {t("confirmMapping")}
          </button>
        </>
      )}

      {view === "reports" && project && (
        <>
          {(() => {
            const featured = buildReports(project).find((r) => r.featured);
            if (!featured) return null;
            return (
              <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/60 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{featured.title}</p>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">{featured.description ?? t("fullBaseImportHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(featured.rows, `${project.displayNumber}-baza-os-dlya-1c.csv`)
                    }
                    className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white"
                  >
                    {t("downloadCsv1C")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const res = downloadXlsxIfAllowed(
                        featured.rows,
                        `${project.displayNumber}-baza-os-dlya-1c.xlsx`,
                        "База ОС",
                      );
                      if (!res.ok) alert(t("xlsxLimit"));
                    }}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white"
                  >
                    XLSX
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">{t("fullBaseImportFormat")}</p>
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void exportProject()} className="px-3 py-2 text-xs rounded-lg border border-gray-200">
              {t("exportProject")}
            </button>
            <button
              type="button"
              onClick={() => {
                const reports = buildReports(project);
                void downloadZip(
                  reports.map((r) => ({ name: `${r.id}.csv`, content: reportToCsvContent(r.rows) })),
                  `${project.displayNumber}-reports.zip`,
                );
                void persist(markExported(project));
              }}
              className="px-3 py-2 text-xs rounded-lg bg-gray-900 text-white"
            >
              {t("exportAll")}
            </button>
          </div>
          <div className="grid gap-2">
            {buildReports(project)
              .filter((r) => !r.featured)
              .map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <span className="text-sm">{r.title}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => downloadCsv(r.rows, `${project.displayNumber}-${r.id}.csv`)}
                    className="text-xs px-2 py-1 border rounded"
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const res = downloadXlsxIfAllowed(r.rows, `${project.displayNumber}-${r.id}.xlsx`, r.title);
                      if (!res.ok) alert(t("xlsxLimit"));
                    }}
                    className="text-xs px-2 py-1 border rounded"
                  >
                    XLSX
                  </button>
                </div>
              </div>
            ))}
          </div>
          {project.changeLog.length > 0 && (
            <details className="text-xs text-gray-500">
              <summary>{t("changeLog")}</summary>
              <ul className="mt-2 space-y-1 max-h-32 overflow-auto">
                {project.changeLog.slice(0, 20).map((e) => (
                  <li key={e.id}>{new Date(e.at).toLocaleString("ru-RU")} — {e.action}: {e.detail}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <ManualInputModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={(raw) => void (view === "scan-a" ? handleScanA(raw) : handleScanB(raw))}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title={t("deleteProject")}
        message={deleteTarget ? t("deleteProjectWarn", { number: deleteTarget.number, name: deleteTarget.name }) : ""}
        confirmLabel={t("deleteForever")}
        cancelLabel={t("cancel")}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void deleteProject(deleteTarget.id).then(refreshList);
          setDeleteTarget(null);
        }}
        extra={
          deleteTarget && !deleteTarget.exported ? (
            <button
              type="button"
              className="text-xs text-sky-600 underline"
              onClick={() => {
                void loadProject(deleteTarget.id).then((p) => {
                  if (p) {
                    downloadText(JSON.stringify(exportProjectFile(p), null, 2), `${p.displayNumber}.qhub-inventory`, "application/json");
                  }
                });
              }}
            >
              {t("downloadBeforeDelete")}
            </button>
          ) : null
        }
      />

      <ConfirmModal
        open={!!duplicateAsk}
        title={t("statusDuplicate")}
        message={duplicateAsk ? t("duplicateAsk", { id: duplicateAsk.identifier, when: duplicateAsk.when }) : ""}
        confirmLabel={t("yes")}
        cancelLabel={t("no")}
        onCancel={() => {
          if (duplicateAsk && project) void persist(incrementScanOnly(project, duplicateAsk.baseRowId));
          setDuplicateAsk(null);
        }}
        onConfirm={() => {
          setFormModal("duplicate");
        }}
      />

      <ConfirmModal
        open={!!deleteRowId}
        title={t("deleteRow")}
        message={t("deleteRowConfirm")}
        confirmLabel={t("deleteRow")}
        cancelLabel={t("cancel")}
        danger
        onCancel={() => setDeleteRowId(null)}
        onConfirm={() => {
          if (deleteRowId && project) void persist(deleteLedgerRow(project, deleteRowId));
          setDeleteRowId(null);
        }}
      />

      <ConfirmModal
        open={reopenAsk}
        title={t("reopenProject")}
        message={t("reopenProjectWarn")}
        confirmLabel={t("reopenConfirm")}
        cancelLabel={t("cancel")}
        onCancel={() => setReopenAsk(false)}
        onConfirm={() => void confirmReopenProject()}
      />

      <ConfirmModal
        open={!!resumeAsk}
        title={t("resumeProject")}
        message=""
        confirmLabel={t("resumeYes")}
        cancelLabel={t("resumeNo")}
        onConfirm={() => {
          if (resumeAsk) void openProject(resumeAsk);
          setResumeAsk(null);
        }}
        onCancel={() => {
          clearActiveProjectId();
          setResumeAsk(null);
        }}
      />

      {(formModal === "duplicate" || formModal === "surplus") && project && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 space-y-3">
            <h3 className="font-semibold">{formModal === "duplicate" ? t("duplicateFormTitle") : t("surplusFormTitle")}</h3>
            {(["location", "description", "comment"] as const).map((f) => (
              <input
                key={f}
                value={formState[f]}
                onChange={(e) => setFormState((s) => ({ ...s, [f]: e.target.value }))}
                placeholder={t(f)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            ))}
            {formModal === "duplicate" && (
              <select
                value={formState.matchesBase}
                onChange={(e) => setFormState((s) => ({ ...s, matchesBase: e.target.value as MatchQuality }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">{t("matchesBase")}</option>
                <option value="yes">{t("yes")}</option>
                <option value="no">{t("no")}</option>
                <option value="partial">Частично</option>
              </select>
            )}
            <label className="block text-xs">
              {t("photo")}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-1 block w-full text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void compressPhoto(file).then((url) => setFormState((s) => ({ ...s, photo: url })));
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (!project) return;
                let next = project;
                const photoBytes = formState.photo ? estimateDataUrlBytes(formState.photo) : 0;
                if (formModal === "duplicate" && duplicateAsk) {
                  next = addDuplicateEntry(next, {
                    identifier: duplicateAsk.identifier,
                    firstScanAt: duplicateAsk.when,
                    duplicateScanAt: nowIso(),
                    location: formState.location,
                    description: formState.description,
                    matchesBase: formState.matchesBase,
                    comment: formState.comment,
                    photoDataUrl: formState.photo,
                  });
                } else if (pendingSurplus) {
                  next = addSurplusEntry(next, {
                    identifier: pendingSurplus.identifier,
                    scannedAt: nowIso(),
                    location: formState.location,
                    description: formState.description,
                    comment: formState.comment,
                    photoDataUrl: formState.photo,
                    rawValues: {},
                  });
                }
                next = { ...next, totalPhotoBytes: next.totalPhotoBytes + photoBytes };
                void persist(next);
                setFormModal(null);
                setDuplicateAsk(null);
                setPendingSurplus(null);
                setFormState({ location: "", description: "", matchesBase: "", comment: "", photo: null });
              }}
              className="w-full py-2 rounded-lg bg-gray-900 text-white text-sm"
            >
              {t("save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
