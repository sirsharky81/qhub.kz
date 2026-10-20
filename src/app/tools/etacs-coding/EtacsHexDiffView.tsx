"use client";

import { useEffect, useRef, useState } from "react";

function splitHexBytes(hex: string): string[] {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  return clean.match(/.{1,2}/g) ?? [];
}

interface Props {
  openedHex: string;
  currentHex: string;
  selectedByteIndices?: number[];
  selectedParamId?: number | null;
  selectedParamName?: string;
  selectedParamNameRu?: string;
  editingLocked?: boolean;
  onManualHexChange?: (rawHex: string) => void;
}

export function EtacsHexDiffView({
  openedHex,
  currentHex,
  selectedByteIndices = [],
  selectedParamId,
  selectedParamName,
  selectedParamNameRu,
  editingLocked = false,
  onManualHexChange,
}: Props) {
  const opened = splitHexBytes(openedHex);
  const current = splitHexBytes(currentHex);
  const len = Math.max(opened.length, current.length);
  const selectedSet = new Set(selectedByteIndices);

  const [showRawInput, setShowRawInput] = useState(false);
  const [rawDraft, setRawDraft] = useState(currentHex);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const firstSelectedColRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRawDraft(currentHex);
  }, [currentHex]);

  // Автопрокрутка к байту выбранного параметра
  useEffect(() => {
    if (selectedByteIndices.length === 0) return;
    const el = firstSelectedColRef.current;
    const container = scrollContainerRef.current;
    if (!el || !container) return;
    const elLeft = el.offsetLeft;
    const elWidth = el.offsetWidth;
    const cScroll = container.scrollLeft;
    const cWidth = container.clientWidth;
    if (elLeft < cScroll + 32 || elLeft + elWidth > cScroll + cWidth - 16) {
      container.scrollTo({
        left: Math.max(0, elLeft - cWidth / 2 + elWidth / 2),
        behavior: "smooth",
      });
    }
  }, [selectedByteIndices]);

  const changes: { index: number; from: string; to: string }[] = [];
  for (let i = 0; i < len; i++) {
    const a = opened[i] ?? "—";
    const b = current[i] ?? "—";
    if (a !== b) changes.push({ index: i, from: a, to: b });
  }

  const firstSelectedIdx = selectedByteIndices.length > 0 ? Math.min(...selectedByteIndices) : -1;
  const hasDistinctRu =
    selectedParamNameRu &&
    selectedParamName &&
    selectedParamNameRu.toLowerCase() !== selectedParamName.toLowerCase();

  return (
    <div className="etacs-hex-strip border-b border-gray-200 bg-slate-50/90 px-2 py-1 text-[10px]">
      {/* Компактная однострочная шапка инфо по байтам */}
      <div className="mb-0.5 flex items-center justify-between gap-2 overflow-x-auto whitespace-nowrap scrollbar-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold uppercase tracking-wider text-[9px] text-gray-500 shrink-0">
            HEX ({len}Б)
          </span>

          {selectedSet.size > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0 text-[9.5px] font-medium text-blue-800 ring-1 ring-inset ring-blue-200">
              <span className="truncate max-w-[220px] sm:max-w-[380px]">
                {selectedParamId != null ? `#${selectedParamId} ` : ""}
                {selectedParamName || "Параметр"}
                {hasDistinctRu ? ` · ${selectedParamNameRu}` : ""}
              </span>
              <span className="font-mono font-bold text-blue-700">
                →{" "}
                {[...selectedSet]
                  .map((i) => `#${i}(0x${i.toString(16).toUpperCase().padStart(2, "0")})`)
                  .join(",")}
              </span>
            </span>
          ) : (
            <span className="text-[9.5px] text-gray-400">
              Нажмите на строку для подсветки байта
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {changes.length > 0 ? (
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-semibold text-amber-800">
                Изм.({changes.length}):
              </span>
              {changes.slice(0, 6).map((c) => (
                <span
                  key={c.index}
                  className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0 font-mono text-[9px] text-amber-950 ring-1 ring-inset ring-amber-300"
                  title={`Байт #${c.index}: было ${c.from} → стало ${c.to}`}
                >
                  <span className="text-amber-700">#{c.index}</span>
                  <span className="text-gray-500 line-through">{c.from}</span>
                  <span>→</span>
                  <span className="font-bold">{c.to}</span>
                </span>
              ))}
              {changes.length > 6 ? (
                <span className="text-[9px] text-amber-800">+{changes.length - 6}</span>
              ) : null}
            </div>
          ) : (
            <span className="text-[9px] text-gray-400">Без изм.</span>
          )}

          {onManualHexChange ? (
            <button
              type="button"
              onClick={() => setShowRawInput((v) => !v)}
              className="rounded border border-gray-200 bg-white px-1 py-0 text-[9px] font-medium text-gray-600 hover:bg-gray-100"
              title="Ввести или скопировать HEX-строку вручную"
            >
              {showRawInput ? "Скрыть" : "HEX"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Две плотные синхронные строки БЫЛО / СТАЛО */}
      <div
        ref={scrollContainerRef}
        className="etacs-hex-scroll overflow-x-auto rounded border border-gray-200 bg-white px-1 py-0.5"
      >
        <div className="inline-flex min-w-full flex-col gap-0 font-mono text-[9.5px] leading-none">
          {/* Строка БЫЛО */}
          <div className="flex items-center h-[13px]">
            <span className="sticky left-0 z-10 w-8 shrink-0 bg-white pr-1 text-[8px] font-sans font-semibold uppercase tracking-wider text-gray-400 select-none">
              Было
            </span>
            <div className="flex items-center gap-0">
              {Array.from({ length: len }, (_, i) => {
                const was = opened[i] ?? "??";
                const cur = current[i] ?? "??";
                const diff = cur !== was;
                const sel = selectedSet.has(i);
                return (
                  <div
                    key={i}
                    ref={i === firstSelectedIdx ? firstSelectedColRef : undefined}
                    title={`Байт #${i} (0x${i.toString(16).toUpperCase().padStart(2, "0")}) · Было: ${was}`}
                    className={[
                      "w-[16px] shrink-0 text-center rounded-t py-[1px] tabular-nums select-all",
                      diff
                        ? "bg-amber-50 text-amber-800/80 line-through decoration-amber-500/70"
                        : "text-gray-400",
                      sel ? "bg-blue-50 text-blue-900 font-semibold ring-1 ring-inset ring-blue-400" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {was}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Строка СТАЛО */}
          <div className="flex items-center h-[13px]">
            <span className="sticky left-0 z-10 w-8 shrink-0 bg-white pr-1 text-[8px] font-sans font-semibold uppercase tracking-wider text-gray-600 select-none">
              Стало
            </span>
            <div className="flex items-center gap-0">
              {Array.from({ length: len }, (_, i) => {
                const was = opened[i] ?? "??";
                const cur = current[i] ?? "??";
                const diff = cur !== was;
                const sel = selectedSet.has(i);
                return (
                  <div
                    key={i}
                    title={
                      diff
                        ? `Байт #${i} (0x${i.toString(16).toUpperCase().padStart(2, "0")}): было ${was} → стало ${cur}`
                        : `Байт #${i} (0x${i.toString(16).toUpperCase().padStart(2, "0")}): ${cur}`
                    }
                    className={[
                      "w-[16px] shrink-0 text-center rounded-b py-[1px] tabular-nums select-all",
                      diff
                        ? "bg-amber-300/90 font-bold text-amber-950"
                        : "text-gray-800",
                      sel ? "ring-1 ring-inset ring-blue-600 bg-blue-100/90 font-bold text-blue-950" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {cur}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Опциональное поле ручного ввода HEX (скрыто по умолчанию) */}
      {showRawInput && onManualHexChange ? (
        <div className="mt-1 flex items-center gap-1.5">
          <input
            type="text"
            spellCheck={false}
            readOnly={editingLocked}
            value={rawDraft}
            onChange={(e) => {
              setRawDraft(e.target.value);
              onManualHexChange(e.target.value);
            }}
            className="w-full rounded border border-gray-300 bg-white px-2 py-0.5 font-mono text-[10px] text-gray-800 focus:border-blue-500 focus:outline-none"
            placeholder="HEX-строка кодировки…"
          />
        </div>
      ) : null}
    </div>
  );
}
