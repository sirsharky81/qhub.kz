"use client";

import { useCallback, useEffect, useState } from "react";
import { clearAgentDebugLogs, getAgentDebugLogs } from "@/lib/debug-agent-log";

const DEBUG_FLAG = "qhub-debug-47c766";

export default function DebugLogPanel() {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "47c766") {
      localStorage.setItem(DEBUG_FLAG, "1");
    }
    setVisible(
      params.get("debug") === "47c766" || localStorage.getItem(DEBUG_FLAG) === "1",
    );
  }, []);

  useEffect(() => {
    if (!visible) return;
    const tick = () => {
      try {
        const logs = JSON.parse(getAgentDebugLogs());
        setCount(Array.isArray(logs) ? logs.length : 0);
      } catch {
        setCount(0);
      }
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [visible]);

  const copyLogs = useCallback(async () => {
    const text = getAgentDebugLogs();
    try {
      await navigator.clipboard.writeText(text);
      alert(`Скопировано ${count} событий`);
    } catch {
      prompt("Скопируйте логи:", text);
    }
  }, [count]);

  const clearLogs = useCallback(() => {
    clearAgentDebugLogs();
    setCount(0);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-2 left-2 right-2 z-[9999] rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs shadow-lg">
      <p className="font-semibold text-amber-900">Debug 47c766 — lock screen ({count} событий)</p>
      <p className="mt-1 text-amber-800">
        Работает и в PWA после одного открытия с ?debug=47c766 в Safari. Скопируйте логи после
        воспроизведения бага.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={copyLogs}
          className="rounded bg-amber-600 px-3 py-1.5 text-white"
        >
          Копировать логи
        </button>
        <button
          type="button"
          onClick={clearLogs}
          className="rounded border border-amber-400 px-3 py-1.5 text-amber-900"
        >
          Очистить
        </button>
      </div>
    </div>
  );
}
