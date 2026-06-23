"use client";

import type { LottoTicket } from "@/lib/random-picker/lotto-tickets";

interface LottoTicketCardProps {
  playerName?: string;
  ticket: LottoTicket;
  drawn: readonly number[];
  highlightRows?: readonly number[];
  compact?: boolean;
}

export function LottoTicketCard({
  playerName,
  ticket,
  drawn,
  highlightRows = [],
  compact = false,
}: LottoTicketCardProps) {
  const drawnSet = new Set(drawn);
  const highlightSet = new Set(highlightRows);
  const cellClass = compact ? "h-7 text-[11px]" : "h-9 text-xs sm:text-sm";

  return (
    <div className="space-y-1.5">
      {playerName && (
        <p
          className={`font-semibold text-gray-800 dark:text-gray-200 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {playerName}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] border-collapse">
          <tbody>
            {ticket.rows.map((row, rowIdx) => {
              const rowWin = highlightSet.has(rowIdx);
              return (
                <tr
                  key={rowIdx}
                  className={rowWin ? "bg-emerald-50 dark:bg-emerald-950/30" : undefined}
                >
                  {row.map((cell, colIdx) => {
                    if (cell === null) {
                      return (
                        <td
                          key={colIdx}
                          className={`border border-gray-200 dark:border-gray-700 ${
                            rowWin
                              ? "bg-emerald-100 dark:bg-emerald-900/40"
                              : "bg-gray-50 dark:bg-gray-800/60"
                          } ${cellClass}`}
                        />
                      );
                    }
                    const hit = drawnSet.has(cell);
                    return (
                      <td
                        key={colIdx}
                        className={`border border-gray-300 dark:border-gray-600 text-center font-bold tabular-nums ${cellClass} ${
                          rowWin
                            ? "bg-emerald-400 text-emerald-950 ring-2 ring-emerald-500 ring-inset"
                            : hit
                              ? "bg-amber-400 text-amber-950"
                              : "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        }`}
                      >
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
