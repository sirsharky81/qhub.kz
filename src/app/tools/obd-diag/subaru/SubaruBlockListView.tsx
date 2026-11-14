"use client";

import { useMemo, useState } from "react";
import type { ModuleDtcReport } from "@/lib/obd/obd-session";
import type { Ssm4Group } from "@/lib/obd/subaru-ssm4-catalog";
import {
  getAllSubaruBlockProfiles,
  getSubaruBlockScanStatus,
  pickSubaruSystemReport,
  type SubaruBlockProfile,
  type SubaruBlockScanStatus,
} from "@/lib/obd/subaru-ssm4-modules";

interface Props {
  reportsByTx: Record<string, ModuleDtcReport>;
  onSelectBlock: (systemId: string) => void;
}

const STATUS_DOT: Record<
  SubaruBlockScanStatus,
  { label: string; cls: string }
> = {
  current: { label: "Current DTC", cls: "bg-red-100 text-red-800 border-red-200" },
  history: { label: "History DTC", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  no_dtc: { label: "No DTC", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  unscanned: { label: "Не опрошен", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  not_detected: { label: "Нет ответа", cls: "bg-gray-100 text-gray-400 border-gray-200" },
};

const GROUP_OPTIONS: Array<{ id: "ALL" | Ssm4Group; label: string }> = [
  { id: "ALL", label: "Все системы" },
  { id: "Powertrain", label: "Powertrain" },
  { id: "Chassis", label: "Chassis" },
  { id: "Body", label: "Body" },
];

export function SubaruBlockListView({ reportsByTx, onSelectBlock }: Props) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"ALL" | Ssm4Group>("ALL");

  const profiles = useMemo(() => getAllSubaruBlockProfiles(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles.filter((p) => {
      if (group !== "ALL" && p.system.group !== group) return false;
      if (!q) return true;
      return `${p.system.abbr} ${p.system.nameEn} ${p.system.nameRu}`
        .toLowerCase()
        .includes(q);
    });
  }, [profiles, query, group]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Target Each System · Выбор блока SSM4 ({profiles.length})
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Выберите блок — откроется отдельная страница блока с вкладками функций (DTC, Cancel Code, Data Monitor, Active Test, Work Support, Customize, ECU Info).
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск блока (Engine, TM, BIU, EyeSight…)"
            className="w-full sm:max-w-xs rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {GROUP_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setGroup(opt.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  group === opt.id
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((profile: SubaruBlockProfile) => {
          const { system, activeTests, workSupport, customizeItems, signals } = profile;
          const report = pickSubaruSystemReport(system, reportsByTx);
          const status = getSubaruBlockScanStatus(report);
          const badge = STATUS_DOT[status];

          return (
            <button
              key={system.id}
              type="button"
              onClick={() => onSelectBlock(system.id)}
              className="group flex flex-col justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-gray-900 hover:shadow-xs"
            >
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-gray-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                        {system.abbr}
                      </span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {system.group}
                      </span>
                    </div>
                    <h4 className="mt-1 text-sm font-bold text-gray-900 group-hover:text-emerald-800">
                      {system.nameEn}
                    </h4>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="text-[11px] leading-snug text-gray-600">{system.nameRu}</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-1 border-t border-gray-100 pt-2 text-[10px] text-gray-500">
                <div className="flex flex-wrap gap-1">
                  {signals.length > 0 && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5">
                      Live {signals.length}
                    </span>
                  )}
                  {activeTests.length > 0 && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800">
                      Active {activeTests.length}
                    </span>
                  )}
                  {workSupport.length > 0 && (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                      Work {workSupport.length}
                    </span>
                  )}
                  {customizeItems.length > 0 && (
                    <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-800">
                      Cust {customizeItems.length}
                    </span>
                  )}
                </div>
                <span className="font-semibold text-gray-900 group-hover:translate-x-0.5 transition">
                  Открыть →
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-xs text-gray-500">
          По запросу «{query}» блоки не найдены.
        </div>
      )}
    </div>
  );
}
