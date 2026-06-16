"use client";

import { useCallback, useRef, useState } from "react";
import type { ParticipantTable } from "@/lib/random-picker";
import {
  CSV_FORMAT_HINT,
  addColumn,
  addRow,
  createEmptyTable,
  removeColumn,
  removeRow,
  setKeyColumn,
  updateCell,
  updateColumnName,
  tableRowCount,
  hasTableData,
  getKeyColumnIndex,
  findDuplicates,
  formatDuplicateWarning,
  dedupeParticipants,
  extractParticipants,
  importTableFromFile,
  downloadParticipantCsv,
  downloadParticipantXlsx,
} from "@/lib/random-picker";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { PickerButton, PickerSection } from "./PickerButton";
import { ListConfirmDialog, type ListConfirmKind } from "./ListConfirmDialog";

interface ParticipantTableEditorProps {
  table: ParticipantTable;
  onChange: (table: ParticipantTable) => void;
  highlightedRows?: number[];
  duplicateDecision: "pending" | "keep" | "deduped" | null;
  onDuplicateDecision: (d: "keep" | "deduped") => void;
  eventName?: string;
  onListReset?: () => void;
  onClearEvent?: () => void;
}

export function ParticipantTableEditor({
  table,
  onChange,
  highlightedRows = [],
  duplicateDecision,
  onDuplicateDecision,
  eventName,
  onListReset,
  onClearEvent,
}: ParticipantTableEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const coarsePointer = useCoarsePointer();
  const [importError, setImportError] = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ListConfirmKind | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [clearEventOnReset, setClearEventOnReset] = useState(false);

  const keyIdx = getKeyColumnIndex(table);
  const participants = extractParticipants(table);
  const duplicates = findDuplicates(participants);
  const rowCount = tableRowCount(table);
  const filledRowCount = table.rows.filter((row) => row.some((cell) => cell.trim())).length;
  const hasData = hasTableData(table);

  const focusCell = useCallback((rowIndex: number, colIndex: number) => {
    requestAnimationFrame(() => {
      cellRefs.current[`${rowIndex}-${colIndex}`]?.focus();
    });
  }, []);

  const handleEnterNavigation = useCallback(
    (rowIndex: number, colIndex: number) => {
      const colCount = table.columns.length;
      let nextRow = rowIndex;
      let nextCol = colIndex + 1;

      if (nextCol >= colCount) {
        nextCol = 0;
        nextRow = rowIndex + 1;
      }

      if (nextRow >= table.rows.length) {
        const withRow = addRow(table);
        onChange(withRow);
        focusCell(nextRow, nextCol);
      } else {
        focusCell(nextRow, nextCol);
      }
    },
    [table, onChange, focusCell],
  );

  const applyImport = async (file: File) => {
    setImportError(null);
    try {
      const imported = await importTableFromFile(file);
      onChange(imported);
      onListReset?.();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Ошибка импорта");
    }
  };

  const applyNewList = () => {
    onChange(createEmptyTable());
    onListReset?.();
    if (clearEventOnReset) onClearEvent?.();
  };

  const closeConfirm = () => {
    setConfirmKind(null);
    setPendingFile(null);
    setClearEventOnReset(false);
  };

  const handleFileSelected = (file: File) => {
    if (hasData) {
      setPendingFile(file);
      setConfirmKind("import");
      return;
    }
    void applyImport(file);
  };

  const handleNewListClick = () => {
    if (hasData) {
      setConfirmKind("newList");
      return;
    }
    applyNewList();
  };

  const handleConfirmDownload = () => {
    downloadParticipantCsv(table, eventName);
    if (confirmKind === "import" && pendingFile) {
      void applyImport(pendingFile);
    } else if (confirmKind === "newList") {
      applyNewList();
    }
    closeConfirm();
  };

  const handleConfirmAction = () => {
    if (confirmKind === "import" && pendingFile) {
      void applyImport(pendingFile);
    } else if (confirmKind === "newList") {
      applyNewList();
    }
    closeConfirm();
  };

  const handleDedupe = () => {
    const seen = new Set<string>();
    const newRows = table.rows.filter((row) => {
      const val = (row[keyIdx] ?? "").trim();
      if (!val || seen.has(val)) return false;
      seen.add(val);
      return true;
    });
    onChange({ ...table, rows: newRows.length ? newRows : [table.columns.map(() => "")] });
    onDuplicateDecision("deduped");
  };

  return (
    <PickerSection
      title="Участники"
      hint="Один список для всех режимов. Загрузка файла заменяет таблицу. Данные сохраняются в этой вкладке браузера."
    >
      <div className="flex flex-wrap gap-2">
        <PickerButton variant="secondary" onClick={() => fileRef.current?.click()}>
          Загрузить CSV / Excel
        </PickerButton>
        <PickerButton
          variant="ghost"
          disabled={!hasData}
          onClick={() => downloadParticipantCsv(table, eventName)}
        >
          Скачать CSV
        </PickerButton>
        <PickerButton
          variant="ghost"
          disabled={!hasData}
          onClick={() => downloadParticipantXlsx(table, eventName)}
        >
          Скачать Excel
        </PickerButton>
        <PickerButton variant="ghost" onClick={handleNewListClick}>
          Новый список
        </PickerButton>
      </div>

      <div className="flex flex-wrap gap-2">
        <PickerButton variant="ghost" onClick={() => setShowFormat((v) => !v)}>
          {showFormat ? "Скрыть формат" : "Формат файла"}
        </PickerButton>
        <PickerButton variant="ghost" onClick={() => onChange(addColumn(table))}>
          + Столбец
        </PickerButton>
        {table.columns.length > 1 && (
          <PickerButton
            variant="ghost"
            onClick={() => onChange(removeColumn(table, table.columns.at(-1)!.id))}
          >
            − Столбец
          </PickerButton>
        )}
        <PickerButton variant="ghost" onClick={() => onChange(addRow(table))}>
          + Строка
        </PickerButton>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileSelected(f);
          e.target.value = "";
        }}
      />

      {showFormat && (
        <pre className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 whitespace-pre-wrap font-mono leading-relaxed border border-gray-100 dark:border-gray-700">
          {CSV_FORMAT_HINT}
        </pre>
      )}

      {importError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {importError}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full min-w-[480px] text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/80">
              <th className="w-8 p-1.5 text-[10px] text-gray-400 font-normal border-b border-gray-200 dark:border-gray-700">
                №
              </th>
              {table.columns.map((col, ci) => {
                const isKey = col.id === table.keyColumnId;
                return (
                  <th
                    key={col.id}
                    className={`p-1.5 border-b border-l border-gray-200 dark:border-gray-700 transition-colors ${
                      isKey
                        ? "bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-inset ring-indigo-200 dark:ring-indigo-800"
                        : ""
                    }`}
                  >
                    <div className="space-y-1">
                      <input
                        value={col.name}
                        onChange={(e) =>
                          onChange(updateColumnName(table, col.id, e.target.value))
                        }
                        className={`w-full text-[11px] font-semibold uppercase tracking-wide bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 ${
                          isKey ? "text-indigo-700 dark:text-indigo-300" : "text-gray-600 dark:text-gray-400"
                        }`}
                        aria-label={`Название столбца ${ci + 1}`}
                      />
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="key-column"
                          checked={isKey}
                          onChange={() => onChange(setKeyColumn(table, col.id))}
                          className="w-3 h-3"
                        />
                        <span className="text-[10px] text-gray-500">Поле выбора</span>
                      </label>
                    </div>
                  </th>
                );
              })}
              <th className="w-8 border-b border-l border-gray-200 dark:border-gray-700" />
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => {
              const isHighlighted = highlightedRows.includes(ri);
              return (
                <tr
                  key={ri}
                  className={`transition-colors ${
                    isHighlighted
                      ? "bg-emerald-50 dark:bg-emerald-950/30"
                      : ri % 2 === 0
                        ? "bg-white dark:bg-gray-900"
                        : "bg-gray-50/50 dark:bg-gray-900/50"
                  }`}
                >
                  <td className="p-1.5 text-[10px] text-gray-400 text-center border-b border-gray-100 dark:border-gray-800">
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => {
                    const isKeyCol = table.columns[ci]?.id === table.keyColumnId;
                    return (
                      <td
                        key={ci}
                        className={`p-0 border-b border-l border-gray-100 dark:border-gray-800 ${
                          isKeyCol
                            ? "bg-indigo-50/50 dark:bg-indigo-950/20"
                            : isHighlighted
                              ? "bg-emerald-50/80 dark:bg-emerald-950/20"
                              : ""
                        }`}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${ri}-${ci}`] = el;
                          }}
                          value={cell}
                          onChange={(e) =>
                            onChange(updateCell(table, ri, ci, e.target.value))
                          }
                          onKeyDown={(e) => {
                            if (!coarsePointer && e.key === "Enter") {
                              e.preventDefault();
                              handleEnterNavigation(ri, ci);
                            }
                          }}
                          placeholder={table.columns[ci]?.name ?? ""}
                          className="w-full px-2 py-1.5 text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-indigo-400 text-gray-900 dark:text-gray-100 placeholder:text-gray-300"
                          aria-label={`Строка ${ri + 1}, ${table.columns[ci]?.name}`}
                        />
                      </td>
                    );
                  })}
                  <td className="p-1 border-b border-l border-gray-100 dark:border-gray-800 text-center">
                    <button
                      type="button"
                      onClick={() => onChange(removeRow(table, ri))}
                      className="text-gray-300 hover:text-red-500 text-xs px-1"
                      aria-label={`Удалить строку ${ri + 1}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-2 gap-y-0.5">
        <span>
          Участников: <strong className="text-gray-800 dark:text-gray-200">{rowCount}</strong>
          {table.columns[keyIdx] && (
            <span className="ml-2 text-indigo-600 dark:text-indigo-400">
              · выбор по «{table.columns[keyIdx].name}»
            </span>
          )}
        </span>
        <span className="text-gray-400 dark:text-gray-500">· сохранено в этой вкладке</span>
      </div>

      {duplicateDecision === "pending" && duplicates.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
          <p className="text-xs text-amber-900 dark:text-amber-100">
            ⚠ {formatDuplicateWarning(duplicates)}
          </p>
          <div className="flex gap-2">
            <PickerButton variant="secondary" size="sm" onClick={handleDedupe}>
              Да, удалить
            </PickerButton>
            <PickerButton variant="ghost" size="sm" onClick={() => onDuplicateDecision("keep")}>
              Нет, оставить
            </PickerButton>
          </div>
        </div>
      )}

      {confirmKind && (
        <ListConfirmDialog
          kind={confirmKind}
          participantCount={Math.max(rowCount, filledRowCount)}
          clearEvent={clearEventOnReset}
          onClearEventChange={setClearEventOnReset}
          onDownload={handleConfirmDownload}
          onConfirm={handleConfirmAction}
          onCancel={closeConfirm}
        />
      )}
    </PickerSection>
  );
}
