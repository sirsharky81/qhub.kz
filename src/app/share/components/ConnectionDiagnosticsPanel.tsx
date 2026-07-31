"use client";

import type { ConnectionDiagnostics } from "@/lib/share/connection-diagnostics";
import { diagnosticsLabel, diagnosticsTips } from "@/lib/share/connection-diagnostics";

interface Props {
  diagnostics: ConnectionDiagnostics | null;
  lanPrefer?: boolean;
  connectionState?: string;
}

export function ConnectionDiagnosticsPanel({ diagnostics, lanPrefer, connectionState }: Props) {
  if (!diagnostics) return null;

  const tips = diagnosticsTips(diagnostics, lanPrefer);

  return (
    <div className="mx-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-1.5">
      <p className="font-semibold text-gray-800">Диагностика соединения</p>
      <p>{diagnosticsLabel(diagnostics)}</p>
      {lanPrefer && (
        <p className="text-emerald-700">Режим: локальная Wi‑Fi (без TURN relay)</p>
      )}
      {connectionState === "failed" && (
        <p className="text-red-700">Соединение разорвано — выйдите и подключитесь снова без VPN.</p>
      )}
      {diagnostics.localAddress && <p>Локальный: {diagnostics.localAddress}</p>}
      {diagnostics.remoteAddress && <p>Удалённый: {diagnostics.remoteAddress}</p>}
      {diagnostics.rttMs != null && <p>Задержка: {diagnostics.rttMs} мс</p>}
      {diagnostics.candidateType && <p>ICE: {diagnostics.candidateType}</p>}
      {tips.length > 0 && (
        <ul className="pt-1 space-y-1 text-[11px] text-amber-900">
          {tips.map((tip) => (
            <li key={tip}>• {tip}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
