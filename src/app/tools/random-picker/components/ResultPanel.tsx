"use client";

import { useState } from "react";
import type { ResultTable, VerificationRecord } from "@/lib/random-picker";
import {
  formatShareText,
  copyToClipboard,
  copyResultTable,
  shareResult,
  generateProtocolPdf,
  downloadPdf,
} from "@/lib/random-picker";
import { PickerButton } from "./PickerButton";

interface ResultPanelProps {
  record: VerificationRecord;
}

function participantWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "участник";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "участника";
  return "участников";
}

function ResultTableView({ table, keyColumn }: { table: ResultTable; keyColumn?: string }) {
  const count = table.rows.length;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full min-w-[280px] text-sm border-collapse select-text">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800/80">
              {table.headers.map((header, i) => {
                const isKey = keyColumn !== undefined && header === keyColumn;
                return (
                <th
                  key={i}
                  className={`px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 whitespace-nowrap ${
                    isKey
                      ? "text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/30"
                      : "text-gray-600 dark:text-gray-300"
                  } ${i === 0 && header === "№" ? "bg-gray-100 dark:bg-gray-800/80" : ""}`}
                >
                  {header}
                </th>
              );
              })}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr
                key={ri}
                className={
                  ri % 2 === 0
                    ? "bg-white dark:bg-gray-900"
                    : "bg-gray-50/80 dark:bg-gray-900/50"
                }
              >
                {row.map((cell, ci) => {
                  const header = table.headers[ci];
                  const isKey = keyColumn !== undefined && header === keyColumn;
                  return (
                  <td
                    key={ci}
                    className={`px-2.5 py-1.5 text-xs border-b border-gray-100 dark:border-gray-800 align-top ${
                      header === "№"
                        ? "tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap"
                        : isKey
                          ? "text-gray-900 dark:text-gray-100 font-medium bg-indigo-50/40 dark:bg-indigo-950/20 break-words"
                          : "text-gray-800 dark:text-gray-200 break-words"
                    }`}
                  >
                    {cell || "—"}
                  </td>
                );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Выделите таблицу или нажмите «Копировать таблицу» — вставьте в Excel или Google Таблицы
      </p>
      {count > 1 && (
        <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums">
          {count} {participantWord(count)}
        </p>
      )}
    </div>
  );
}

function PlainResult({ text }: { text: string }) {
  return (
    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed">
      {text}
    </p>
  );
}

export function ResultPanel({ record }: ResultPanelProps) {
  const [copiedTable, setCopiedTable] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const shareText = formatShareText(record);
  const table = record.resultTable;

  const handleCopyTable = async () => {
    if (!table) return;
    const ok = await copyResultTable(table);
    if (ok) {
      setCopiedTable(true);
      setTimeout(() => setCopiedTable(false), 2000);
    }
  };

  const handleCopyAll = async () => {
    const ok = await copyToClipboard(shareText);
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const handleShare = async () => {
    const ok = await shareResult(shareText, record.eventName);
    if (!ok) await handleCopyAll();
  };

  const handlePdf = async () => {
    setPdfLoading(true);
    try {
      const bytes = await generateProtocolPdf(record);
      downloadPdf(bytes, `protocol-${record.id.slice(0, 8)}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Результат</h3>

      <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2" aria-live="polite">
        {table ? <ResultTableView table={table} keyColumn={record.keyColumn} /> : <PlainResult text={record.result} />}
      </div>

      <details className="group rounded-lg border border-gray-100 dark:border-gray-800">
        <summary className="cursor-pointer list-none px-2.5 py-2 text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 select-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <span className="transition-transform group-open:rotate-90">›</span>
            Проверка · {record.date} · {record.time}
          </span>
        </summary>
        <div className="px-2.5 pb-2.5 space-y-1 text-[10px] font-mono text-gray-500 dark:text-gray-400 break-all border-t border-gray-100 dark:border-gray-800 pt-2">
          <p>Seed: {record.seed}</p>
          <p>Hash: {record.verificationHash}</p>
        </div>
      </details>

      <div className="flex flex-wrap gap-2 pt-0.5">
        {table && (
          <PickerButton onClick={handleCopyTable}>
            {copiedTable ? "Скопировано" : "Копировать таблицу"}
          </PickerButton>
        )}
        <PickerButton onClick={handlePdf} disabled={pdfLoading} variant={table ? "secondary" : "primary"}>
          {pdfLoading ? "PDF…" : "Скачать протокол"}
        </PickerButton>
        <PickerButton variant="secondary" onClick={handleCopyAll}>
          {copiedAll ? "Скопировано" : "Копировать всё"}
        </PickerButton>
        <PickerButton variant="secondary" onClick={handleShare}>
          Поделиться
        </PickerButton>
      </div>
    </div>
  );
}
