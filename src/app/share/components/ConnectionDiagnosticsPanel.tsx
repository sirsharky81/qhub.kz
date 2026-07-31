"use client";

import type { ConnectionDiagnostics } from "@/lib/share/connection-diagnostics";
import { diagnosticsLabel } from "@/lib/share/connection-diagnostics";

interface Props {
  diagnostics: ConnectionDiagnostics | null;
}

export function ConnectionDiagnosticsPanel({ diagnostics }: Props) {
  if (!diagnostics) return null;

  return (
    <div className="mx-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
      <p className="font-semibold text-gray-800">Диагностика соединения</p>
      <p>{diagnosticsLabel(diagnostics)}</p>
      {diagnostics.localAddress && <p>Локальный: {diagnostics.localAddress}</p>}
      {diagnostics.remoteAddress && <p>Удалённый: {diagnostics.remoteAddress}</p>}
      {diagnostics.rttMs != null && <p>Задержка: {diagnostics.rttMs} мс</p>}
      {diagnostics.candidateType && <p>ICE: {diagnostics.candidateType}</p>}
    </div>
  );
}
