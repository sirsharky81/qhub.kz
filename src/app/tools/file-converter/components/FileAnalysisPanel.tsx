"use client";

import type { FileAnalysis } from "@/lib/file-converter/types";
import { looksLikeBrokenEncoding } from "@/lib/file-converter/filename-encoding";

const CATEGORY_LABELS: Record<string, string> = {
  image: "Изображение",
  video: "Видео",
  audio: "Аудио",
  pdf: "PDF",
  spreadsheet: "Таблица",
  ebook: "Книга",
  unknown: "Файл",
};

const CATEGORY_ICONS: Record<string, string> = {
  image: "🖼️",
  video: "🎬",
  audio: "🎵",
  pdf: "📄",
  spreadsheet: "📊",
  ebook: "📚",
  unknown: "📎",
};

interface FileAnalysisPanelProps {
  analysis: FileAnalysis;
}

export function FileAnalysisPanel({ analysis }: FileAnalysisPanelProps) {
  const { metadata } = analysis;
  const facts = buildFacts(analysis);
  const encodingIssue =
    analysis.filenameEncodingIssue || looksLikeBrokenEncoding(analysis.name);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-xl flex-shrink-0">
          {CATEGORY_ICONS[analysis.category] ?? "📎"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{analysis.name}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {CATEGORY_LABELS[analysis.category] ?? analysis.category} · {analysis.sizeLabel}
          </p>
        </div>
      </div>

      {facts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {facts.map((fact) => (
            <span
              key={fact}
              className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1"
            >
              {fact}
            </span>
          ))}
        </div>
      )}

      {encodingIssue && analysis.category === "audio" && (
        <div className="mt-3 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex gap-2">
          <span className="flex-shrink-0" aria-hidden>
            🔤
          </span>
          <p className="leading-snug">
            Похоже, битая кодировка в имени файла или в названии трека в плеере (ID3-теги title/artist).
            Выберите <strong>«Исправить имя MP3»</strong> — сервис восстановит читаемое имя файла и
            подпись, которую показывает плеер.
          </p>
        </div>
      )}

      {!analysis.canProcess && analysis.processBlockReason && (
        <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          {analysis.processBlockReason}
        </p>
      )}
    </div>
  );
}

function buildFacts(analysis: FileAnalysis): string[] {
  const { metadata } = analysis;
  const facts: string[] = [];

  if (metadata.image) {
    facts.push(`${metadata.image.width}×${metadata.image.height}`);
    if (metadata.image.hasExif) facts.push("EXIF");
  }
  if (metadata.video?.duration != null) {
    facts.push(formatDuration(metadata.video.duration));
  }
  if (metadata.audio?.duration != null) {
    facts.push(formatDuration(metadata.audio.duration));
  }
  if (metadata.pdf) facts.push(`${metadata.pdf.pageCount} стр.`);
  if (metadata.spreadsheet) facts.push(`${metadata.spreadsheet.sheetCount} лист.`);
  if (metadata.ebook?.title) facts.push(metadata.ebook.title);

  return facts.slice(0, 4);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
