"use client";

import { useMemo, useState } from "react";

interface Column {
  id: string;
  name: string;
}

interface Props {
  columns: Column[];
  rows: Record<string, string>[];
  onRenameColumn?: (id: string, name: string) => void;
  onDeleteRow?: (rowId: string) => void;
  rowIdKey?: string;
}

export default function VirtualDataTable({
  columns,
  rows,
  onRenameColumn,
  onDeleteRow,
  rowIdKey = "id",
}: Props) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const filtered = useMemo(() => {
    let list = rows as (Record<string, string> & { id?: string })[];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((row) => columns.some((c) => (row[c.id] ?? "").toLowerCase().includes(q)));
    }
    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = a[sortCol] ?? "";
        const bv = b[sortCol] ?? "";
        return sortAsc ? av.localeCompare(bv, "ru") : bv.localeCompare(av, "ru");
      });
    }
    return list;
  }, [rows, columns, search, sortCol, sortAsc]);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="overflow-auto border border-gray-200 rounded-xl" style={{ maxHeight: 360 }}>
        <table className="min-w-max w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="px-2 py-2 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap"
                >
                  {editingCol === col.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => {
                        onRenameColumn?.(col.id, editName);
                        setEditingCol(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onRenameColumn?.(col.id, editName);
                          setEditingCol(null);
                        }
                      }}
                      className="w-full border border-gray-300 rounded px-1 py-0.5"
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-left hover:text-gray-900"
                      onClick={() => {
                        if (onRenameColumn) {
                          setEditingCol(col.id);
                          setEditName(col.name);
                          return;
                        }
                        if (sortCol === col.id) setSortAsc((v) => !v);
                        else {
                          setSortCol(col.id);
                          setSortAsc(true);
                        }
                      }}
                    >
                      {col.name}
                      {sortCol === col.id ? (sortAsc ? " ↑" : " ↓") : ""}
                    </button>
                  )}
                </th>
              ))}
              {onDeleteRow && <th className="px-2 py-2 border-b border-gray-200 w-10" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={String(row[rowIdKey])} className="border-b border-gray-100 hover:bg-gray-50/80">
                {columns.map((col) => (
                  <td key={col.id} className="px-2 py-2 align-top text-gray-800 max-w-[200px] truncate" title={row[col.id] ?? ""}>
                    {row[col.id] ?? ""}
                  </td>
                ))}
                {onDeleteRow && (
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onDeleteRow(String(row[rowIdKey]))}
                      className="text-red-500 hover:text-red-700"
                      aria-label="delete"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="p-4 text-sm text-gray-400 text-center">Нет данных</p>}
      </div>
    </div>
  );
}
