import type { ResultTable, VerificationRecord } from "./types";
import { SERVICE_URL } from "./types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function resultTableToTsv(table: ResultTable): string {
  return [table.headers.join("\t"), ...table.rows.map((row) => row.join("\t"))].join("\n");
}

export function resultTableToHtml(table: ResultTable): string {
  const head = table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = table.rows
    .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export async function copyResultTable(table: ResultTable): Promise<boolean> {
  const tsv = resultTableToTsv(table);
  const html = resultTableToHtml(table);

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([tsv], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return true;
    } catch {
      /* fallback */
    }
  }

  return copyToClipboard(tsv);
}

export function formatShareText(record: VerificationRecord): string {  const lines = [
    "Результат случайного выбора",
    "",
    "Мероприятие:",
    record.eventName,
  ];

  if (record.keyColumn) {
    lines.push("", "Поле выбора:", record.keyColumn);
  }

  if (record.mode === "pick" || record.mode === "wheel") {
    lines.push("", "Выбранный участник:", record.result);
    if (record.resultTable) {
      lines.push("", resultTableToTsv(record.resultTable));
    }
  } else if (record.mode === "shuffle") {
    lines.push("", "Новый порядок:", record.result);
    if (record.resultTable) {
      lines.push("", resultTableToTsv(record.resultTable));
    }
  } else if (record.mode === "groups") {
    lines.push("", "Распределение по группам:", record.result);
  } else {
    lines.push("", "Результат:", record.result);
  }

  lines.push(
    "",
    "Количество участников:",
    String(record.participantCount),
    "",
    "Дата:",
    record.date,
    "",
    "Seed:",
    record.seed,
    "",
    "Verification Hash:",
    record.verificationHash,
    "",
    "Сформировано сервисом «Генератор случайных чисел»",
    "",
    "QHub.kz",
    "",
    SERVICE_URL,
  );

  return lines.join("\n");
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareResult(text: string, title: string): Promise<boolean> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url: SERVICE_URL });
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return false;
    }
  }
  return copyToClipboard(text);
}
